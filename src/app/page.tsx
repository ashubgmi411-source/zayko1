"use client";
import React, { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { db } from "@/lib/firebase";
import { collection, doc, onSnapshot, query, orderBy } from "firebase/firestore";
import MenuCard from "@/components/MenuCard";
import { useCart } from "@/context/CartContext";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import JarvisChat from "@/components/JarvisChat";

import { MenuItem, CategoryDoc } from "@/types";

interface CanteenConfig {
  isOpen: boolean;
  startTime: string;
  endTime: string;
}

export default function MenuPage() {
  const { user, profile, loading } = useAuth();
  const { itemCount, total } = useCart();
  const router = useRouter();
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [menuLoading, setMenuLoading] = useState(true);
  const [showUnavailable, setShowUnavailable] = useState(true);
  const [canteenConfig, setCanteenConfig] = useState<CanteenConfig | null>(null);
  const [categories, setCategories] = useState<CategoryDoc[]>([]);
  const [cartPulse, setCartPulse] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.push("/auth");
    }
  }, [user, loading, router]);

  // Real-time Firestore subscription for menu
  useEffect(() => {
    const q = query(collection(db, "menuItems"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })) as MenuItem[];
      setMenuItems(items);
      setMenuLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Real-time canteen config subscription
  useEffect(() => {
    const unsub = onSnapshot(doc(db, "settings", "canteenConfig"), (snap) => {
      if (snap.exists()) {
        setCanteenConfig(snap.data() as CanteenConfig);
      }
    });
    return () => unsub();
  }, []);

  // Real-time categories subscription
  useEffect(() => {
    const q = query(collection(db, "categories"), orderBy("order", "asc"));
    const unsub = onSnapshot(q, (snap) => {
      setCategories(snap.docs.map((d) => ({ id: d.id, ...d.data() })) as CategoryDoc[]);
    });
    return () => unsub();
  }, []);

  // Cart pulse effect whenever itemCount changes
  useEffect(() => {
    if (itemCount > 0) {
      setCartPulse(true);
      const t = setTimeout(() => setCartPulse(false), 1500);
      return () => clearTimeout(t);
    }
  }, [itemCount]);

  // Compute minutes until canteen closes
  const getMinutesUntilClose = (): number | null => {
    if (!canteenConfig?.endTime) return null;
    const now = new Date();
    const [h, m] = canteenConfig.endTime.split(":").map(Number);
    const closeTime = new Date();
    closeTime.setHours(h, m, 0, 0);
    const diff = (closeTime.getTime() - now.getTime()) / 60000;
    return Math.max(0, Math.round(diff));
  };

  const minutesUntilClose = getMinutesUntilClose();
  const isCanteenOpen = canteenConfig?.isOpen !== false;

  const filteredItems = menuItems.filter((item) => {
    const matchesSearch = item.name.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = category === "all" || item.category === category;
    const canPrepare = !item.preparationTime
      || minutesUntilClose === null
      || minutesUntilClose === 0
      || item.preparationTime <= minutesUntilClose;
    const matchesAvailability = showUnavailable ? true : (item.available && item.quantity > 0);
    return matchesSearch && matchesCategory && canPrepare && matchesAvailability;
  }).sort((a, b) => {
    const aAvailable = a.available && a.quantity > 0;
    const bAvailable = b.available && b.quantity > 0;
    if (aAvailable !== bAvailable) return aAvailable ? -1 : 1;
    return 0;
  });

  const availableCount = menuItems.filter((i) => i.available).length;
  const availableItems = filteredItems.filter(i => i.available && i.quantity > 0);
  const unavailableItems = filteredItems.filter(i => !i.available || i.quantity <= 0);

  // Animation variants
  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.05, delayChildren: 0.1 }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20, scale: 0.95 },
    show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] as const } }
  };

  return (
    <div className="min-h-screen animated-gradient-bg pb-28 md:pb-24 relative">
      {/* ─── Compact Mobile Header ─── */}
      <motion.div
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.35 }}
        className="bg-zayko-800/70 backdrop-blur-2xl border-b border-white/[0.06] px-4 py-3 sm:px-6 sm:py-4 sticky top-0 z-40"
      >
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="min-w-0 flex-1">
            <h1 className="text-base sm:text-xl font-display font-bold text-white truncate drop-shadow-sm">
              {profile?.name ? `Hey, ${profile.name.split(" ")[0]} 👋` : "Zayko Menu"}
            </h1>
            <p className="text-[10px] sm:text-xs text-zayko-400 flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${isCanteenOpen ? "bg-emerald-400 animate-pulse shadow-lg shadow-emerald-400/50" : "bg-red-400"}`} />
              {isCanteenOpen ? "Canteen is open" : "Canteen is closed"}
              {minutesUntilClose !== null && minutesUntilClose > 0 && isCanteenOpen
                ? ` · ${minutesUntilClose}m left`
                : ""}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link href="/wallet" className="flex items-center gap-2 px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-gold-500/10 hover:border-gold-500/20 hover:shadow-[0_0_15px_rgba(251,191,36,0.1)] transition-all group" title="Wallet">
              <span className="text-xs sm:text-sm group-hover:scale-110 transition-transform">💰</span>
              <span className="text-price text-xs sm:text-sm font-bold">₹{profile?.walletBalance || 0}</span>
            </Link>
          </div>
        </div>
      </motion.div>

      {/* ─── Quick Access ─── */}
      <div className="px-4 sm:px-6 max-w-7xl mx-auto mt-4 mb-2">
        <motion.div
          className="grid grid-cols-3 gap-2.5 sm:gap-4"
          initial="hidden"
          animate="show"
          variants={containerVariants}
        >
          {[
            { href: "/dashboard/daily-needs", icon: "📋", label: "Daily Needs", color: "bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border-blue-500/20 hover:shadow-[0_0_20px_rgba(59,130,246,0.15)]" },
            { href: "/dashboard/suggest-item", icon: "💡", label: "Suggest", color: "bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border-amber-500/20 hover:shadow-[0_0_20px_rgba(245,158,11,0.15)]" },
            { href: "/dashboard/feedback", icon: "⭐", label: "Feedback", color: "bg-gold-500/10 hover:bg-gold-500/20 text-gold-400 border-gold-500/20 hover:shadow-[0_0_20px_rgba(212,160,23,0.15)]" },
          ].map((item) => (
            <motion.div key={item.href} variants={itemVariants}>
              <Link href={item.href}
                className={`flex flex-col items-center gap-1.5 py-3 sm:py-4 px-2 rounded-2xl border transition-all hover:scale-[1.03] active:scale-[0.97] ${item.color}`}>
                <span className="text-2xl sm:text-3xl drop-shadow-md">{item.icon}</span>
                <span className="text-[10px] sm:text-xs font-bold text-center tracking-tight">{item.label}</span>
              </Link>
            </motion.div>
          ))}
        </motion.div>
      </div>

      {/* ─── Trending Now (Horizontal Slider) ─── */}
      {availableItems.length > 0 && !search && category === "all" && (
        <motion.div
          className="mt-8 mb-4"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
        >
          <div className="px-4 sm:px-6 max-w-7xl mx-auto flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-1 h-6 bg-gold-400 rounded-full shadow-[0_0_8px_rgba(251,191,36,0.4)]" />
              <h2 className="text-lg sm:text-xl font-display font-bold text-white uppercase tracking-wider underline-offset-4">Trending Now</h2>
            </div>
            <span className="text-[10px] sm:text-xs font-bold text-gold-500 bg-gold-500/10 px-2 py-0.5 rounded-full border border-gold-500/20 animate-pulse">POPULAR</span>
          </div>
          <div className="flex overflow-x-auto no-scrollbar gap-4 px-4 sm:px-6 pb-4">
            {availableItems.slice(0, 5).map((item, idx) => (
              <motion.div
                key={`trending-${item.id}`}
                className="min-w-[200px] sm:min-w-[240px] shrink-0"
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.35, delay: idx * 0.08 }}
              >
                <MenuCard {...item} />
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}

      {/* ─── Sticky Search & Filters ─── */}
      <div className="sticky top-[56px] sm:top-[72px] z-30 bg-zayko-900/90 backdrop-blur-2xl border-b border-white/[0.04] shadow-xl shadow-black/20">
        <div className="px-4 sm:px-6 max-w-7xl mx-auto py-3 space-y-3">
          {/* Search */}
          <div className="relative group">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zayko-400 text-sm group-focus-within:text-gold-400 transition-colors">🔍</span>
            <input
              type="text"
              placeholder="Search food items..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-10 py-3 rounded-2xl bg-white/[0.06] border border-white/[0.08] text-white placeholder:text-zayko-500 focus:outline-none focus:ring-2 focus:ring-gold-400/30 focus:border-gold-400/30 focus:shadow-[0_0_25px_rgba(251,191,36,0.1)] text-sm transition-all focus:bg-white/[0.08]"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zayko-400 hover:text-white transition-colors p-1"
              >
                <div className="bg-white/10 rounded-full w-5 h-5 flex items-center justify-center text-[10px]">✕</div>
              </button>
            )}
          </div>

          {/* Category Pills */}
          <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1 pb-0.5">
            <button onClick={() => setCategory("all")}
              className={`px-3.5 py-1.5 rounded-full text-xs sm:text-sm font-semibold whitespace-nowrap transition-all shrink-0 ${category === "all"
                ? "bg-gold-500 text-zayko-900 shadow-md shadow-gold-500/30"
                : "bg-white/[0.06] text-zayko-400 border border-white/[0.08] active:scale-95 hover:bg-white/[0.1]"}`}>
              All
            </button>
            {categories.map((cat) => (
              <button key={cat.id} onClick={() => setCategory(cat.name)}
                className={`px-3.5 py-1.5 rounded-full text-xs sm:text-sm font-semibold whitespace-nowrap transition-all shrink-0 ${category === cat.name
                  ? "bg-gold-500 text-zayko-900 shadow-md shadow-gold-500/30"
                  : "bg-white/[0.06] text-zayko-400 border border-white/[0.08] active:scale-95 hover:bg-white/[0.1]"}`}>
                {cat.name}
              </button>
            ))}
          </div>

          {/* Item count + unavailable toggle */}
          <div className="flex items-center justify-between">
            <p className="text-[10px] sm:text-xs text-zayko-500">{availableCount} items available</p>
            <label className="relative inline-flex items-center cursor-pointer group">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={showUnavailable}
                onChange={() => setShowUnavailable(!showUnavailable)}
              />
              <div className="w-9 h-5 bg-zayko-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-gold-500 shadow-inner"></div>
              <span className="ms-2 text-[10px] sm:text-xs font-medium text-zayko-400 group-hover:text-gold-400 transition-colors">Unavailable</span>
            </label>
          </div>
        </div>
      </div>

      {/* ─── Menu Grid ─── */}
      <div className="px-4 sm:px-6 max-w-7xl mx-auto mt-4 sm:mt-6 space-y-8 sm:space-y-10">
        {menuLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <div className="w-10 h-10 sm:w-12 sm:h-12 border-4 border-gold-400 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
              <p className="text-zayko-400 text-sm">Loading menu...</p>
            </div>
          </div>
        ) : filteredItems.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.35 }}
            className="text-center py-16 sm:py-20 bg-white/[0.03] rounded-3xl border border-white/[0.05]"
          >
            <div className="text-5xl sm:text-6xl mb-3">🍽️</div>
            <h3 className="text-lg sm:text-xl font-display font-bold text-white mb-1">No items found</h3>
            <p className="text-sm text-zayko-400">
              {search ? `No results for "${search}"` : "The menu is empty right now"}
            </p>
          </motion.div>
        ) : (
          <>
            {/* Available Section */}
            {availableItems.length > 0 && (
              <section>
                <motion.div
                  className="flex items-center gap-2.5 mb-4"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  <div className="w-1 h-6 sm:h-7 bg-emerald-500 rounded-full shadow-[0_0_8px_rgba(16,185,129,0.4)]" />
                  <h2 className="text-lg sm:text-xl font-display font-bold text-white">Available Now</h2>
                  <span className="text-xs text-zayko-500">{availableItems.length}</span>
                </motion.div>
                <motion.div
                  className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-5"
                  variants={containerVariants}
                  initial="hidden"
                  animate="show"
                >
                  {availableItems.map((item) => (
                    <motion.div key={item.id} variants={itemVariants}>
                      <MenuCard {...item} />
                    </motion.div>
                  ))}
                </motion.div>
              </section>
            )}

            {/* Unavailable Section */}
            {showUnavailable && unavailableItems.length > 0 && (
              <section>
                <div className="flex items-center gap-2.5 mb-4 pt-4 sm:pt-6 border-t border-white/[0.04]">
                  <div className="w-1 h-6 sm:h-7 bg-zayko-500 rounded-full" />
                  <h2 className="text-lg sm:text-xl font-display font-bold text-white">Not Available</h2>
                  <span className="text-xs text-zayko-500">{unavailableItems.length}</span>
                </div>
                <motion.div
                  className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-5 opacity-70"
                  variants={containerVariants}
                  initial="hidden"
                  animate="show"
                >
                  {unavailableItems.map((item) => (
                    <motion.div key={item.id} variants={itemVariants}>
                      <MenuCard {...item} />
                    </motion.div>
                  ))}
                </motion.div>
              </section>
            )}

            {showUnavailable && unavailableItems.length === 0 && (
              <p className="text-zayko-400 italic text-sm text-center py-4">All items are available! 🎉</p>
            )}
          </>
        )}
      </div>

      {/* ─── Floating Cart Bar ─── */}
      <AnimatePresence>
        {itemCount > 0 && (
          <motion.div
            initial={{ y: 80, opacity: 0, scale: 0.9 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 80, opacity: 0, scale: 0.9 }}
            transition={{ type: "spring", stiffness: 300, damping: 28 }}
            className={`fixed bottom-20 md:bottom-4 left-3 right-3 sm:left-auto sm:right-6 sm:w-auto z-40 ${cartPulse ? 'neon-pulse' : ''}`}
            style={{ borderRadius: '1rem' }}
          >
            <Link
              href="/cart"
              className="flex items-center justify-between gap-4 sm:gap-6 bg-gradient-to-r from-gold-500 to-gold-400 text-zayko-900 px-4 sm:px-6 py-3 sm:py-4 rounded-2xl shadow-[0_8px_32px_rgba(251,191,36,0.3)] hover:shadow-[0_12px_40px_rgba(251,191,36,0.5)] transition-all active:scale-[0.97]"
            >
              <div className="flex items-center gap-2.5">
                <motion.span
                  className="bg-zayko-900/20 w-8 h-8 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center text-sm sm:text-lg"
                  animate={cartPulse ? { rotate: [0, -10, 10, -5, 5, 0] } : {}}
                  transition={{ duration: 0.4 }}
                >
                  🛒
                </motion.span>
                <div>
                  <p className="font-bold text-sm sm:text-base">{itemCount} item{itemCount > 1 ? "s" : ""}</p>
                  <p className="text-[10px] sm:text-xs text-zayko-900/70">View cart</p>
                </div>
              </div>
              <span className="font-display font-bold text-base sm:text-lg">₹{total}</span>
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
