"use client";
import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { db } from "@/lib/firebase";
import { collection, doc, onSnapshot, query, orderBy } from "firebase/firestore";
import MenuCard from "@/components/MenuCard";
import { useCart } from "@/context/CartContext";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import JarvisChat from "@/components/JarvisChat";
import ScheduledOrderModal from "@/components/ScheduledOrderModal";

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
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const trendingRef = useRef<HTMLDivElement>(null);

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

  // Cart pulse effect
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
      transition: { staggerChildren: 0.06, delayChildren: 0.1 }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 24, filter: "blur(4px)" },
    show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] as const } }
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good Morning";
    if (hour < 17) return "Good Afternoon";
    return "Good Evening";
  };

  return (
    <div className="min-h-screen bg-zayko-900 pb-28 md:pb-24 relative overflow-hidden">

      {/* ── Floating Blobs (Background) ── */}
      <div className="premium-blob premium-blob-1 top-[-100px] right-[-80px]" />
      <div className="premium-blob premium-blob-2 top-[200px] left-[-60px]" />
      <div className="premium-blob premium-blob-3 bottom-[300px] right-[10%]" />

      {/* ══════════════════════════════════════
          HERO GREETING SECTION
         ══════════════════════════════════════ */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="relative hero-gradient"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 relative z-10">
          <div className="flex items-center justify-between">
            {/* Greeting */}
            <div className="min-w-0 flex-1">
              <motion.p
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4, delay: 0.1 }}
                className="text-xs sm:text-sm text-zayko-400 font-medium mb-0.5"
              >
                {getGreeting()} ☀️
              </motion.p>
              <motion.h1
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4, delay: 0.15 }}
                className="text-xl sm:text-2xl lg:text-3xl font-display font-bold text-white truncate"
              >
                {profile?.name ? `${profile.name.split(" ")[0]}` : "Welcome"}
              </motion.h1>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
                className="flex items-center gap-2 mt-1.5"
              >
                <span className={`w-2 h-2 rounded-full ${isCanteenOpen ? "bg-emerald-400 shadow-lg shadow-emerald-400/50" : "bg-red-400"}`}>
                  {isCanteenOpen && <span className="absolute w-2 h-2 rounded-full bg-emerald-400 animate-ping" />}
                </span>
                <span className="text-[11px] sm:text-xs text-zayko-400">
                  {isCanteenOpen ? "Canteen Open" : "Canteen Closed"}
                  {minutesUntilClose !== null && minutesUntilClose > 0 && isCanteenOpen
                    ? ` · Closes in ${minutesUntilClose}m`
                    : ""}
                </span>
              </motion.div>
            </div>

            {/* Wallet Chip */}
            {profile && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: "spring", stiffness: 300, damping: 20, delay: 0.2 }}
              >
                <Link
                  href="/wallet"
                  className="flex items-center gap-2 px-3.5 py-2 sm:px-4 sm:py-2.5 rounded-2xl bg-white/[0.05] border border-white/[0.08] hover:bg-white/[0.08] hover:border-gold-400/20 hover:shadow-[0_0_20px_rgba(251,191,36,0.08)] transition-all duration-300 backdrop-blur-xl"
                >
                  <span className="text-sm">💰</span>
                  <span className="price-premium text-sm sm:text-base">₹{profile.walletBalance || 0}</span>
                </Link>
              </motion.div>
            )}
          </div>
        </div>

        {/* Subtle gradient fade at bottom */}
        <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-zayko-900 to-transparent" />
      </motion.div>

      {/* ══════════════════════════════════════
          QUICK ACCESS CARDS
         ══════════════════════════════════════ */}
      <div className="px-4 sm:px-6 max-w-7xl mx-auto mt-2 mb-2 relative z-10">
        <motion.div
          className="grid grid-cols-4 gap-2.5 sm:gap-4"
          initial="hidden"
          animate="show"
          variants={containerVariants}
        >
          {/* 1️⃣ Daily Needs */}
          <motion.div variants={itemVariants}>
            <Link href="/dashboard/daily-needs"
              className="quick-card quick-card-daily flex flex-col items-center gap-1.5 py-3 sm:py-4 px-2 rounded-2xl border border-blue-500/20 bg-blue-500/10 backdrop-blur-md relative overflow-hidden group">
              <span className="text-2xl sm:text-3xl drop-shadow-md relative z-10 group-hover:scale-125 transition-transform duration-300">📋</span>
              <span className="text-[10px] sm:text-xs font-bold text-center tracking-tight text-blue-400 relative z-10">Daily Needs</span>
              <div className="absolute inset-0 quick-shimmer opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            </Link>
          </motion.div>

          {/* 2️⃣ Suggestions */}
          <motion.div variants={itemVariants}>
            <Link href="/suggestions"
              className="quick-card quick-card-suggestions flex flex-col items-center gap-1.5 py-3 sm:py-4 px-2 rounded-2xl border border-purple-500/20 bg-purple-500/10 backdrop-blur-md relative overflow-hidden group">
              <span className="text-2xl sm:text-3xl drop-shadow-md relative z-10 group-hover:scale-110 group-hover:rotate-12 transition-all duration-300">🗳️</span>
              <span className="text-[10px] sm:text-xs font-bold text-center tracking-tight text-purple-400 relative z-10">Suggestions</span>
              <div className="absolute inset-0 bg-gradient-to-br from-purple-500/0 via-purple-500/0 to-fuchsia-500/0 group-hover:from-purple-500/15 group-hover:via-purple-400/10 group-hover:to-fuchsia-500/15 transition-all duration-500" />
              <div className="absolute inset-0 rounded-2xl quick-pulse-ring opacity-0 group-hover:opacity-100" />
            </Link>
          </motion.div>

          {/* 3️⃣ Suggest */}
          <motion.div variants={itemVariants}>
            <Link href="/dashboard/suggest-item"
              className="quick-card quick-card-suggest flex flex-col items-center gap-1.5 py-3 sm:py-4 px-2 rounded-2xl border border-amber-500/20 bg-amber-500/10 backdrop-blur-md relative overflow-hidden group">
              <span className="text-2xl sm:text-3xl drop-shadow-md relative z-10 bulb-glow">💡</span>
              <span className="text-[10px] sm:text-xs font-bold text-center tracking-tight text-amber-400 relative z-10">Suggest</span>
              <div className="absolute top-1 sm:top-2 left-1/2 -translate-x-1/2 w-10 h-10 sm:w-14 sm:h-14 rounded-full bulb-glow-bg" />
            </Link>
          </motion.div>

          {/* 4️⃣ Feedback */}
          <motion.div variants={itemVariants}>
            <Link href="/dashboard/feedback"
              className="quick-card quick-card-feedback flex flex-col items-center gap-1.5 py-3 sm:py-4 px-2 rounded-2xl border border-gold-500/20 bg-gold-500/10 backdrop-blur-md relative overflow-hidden group quick-float">
              <span className="text-2xl sm:text-3xl drop-shadow-md relative z-10 star-bounce">⭐</span>
              <span className="text-[10px] sm:text-xs font-bold text-center tracking-tight text-gold-400 relative z-10">Feedback</span>
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-gold-500/0 via-amber-500/0 to-orange-500/0 group-hover:from-gold-500/15 group-hover:via-amber-400/10 group-hover:to-orange-500/15 transition-all duration-700" />
              <div className="absolute inset-0 rounded-2xl border border-transparent group-hover:border-gold-400/40 group-hover:shadow-[0_0_20px_rgba(251,191,36,0.2)] transition-all duration-500" />
            </Link>
          </motion.div>
        </motion.div>
      </div>

      {/* ══════════════════════════════════════
          TRENDING NOW — Animated Carousel
         ══════════════════════════════════════ */}
      {availableItems.length > 0 && !search && category === "all" && (
        <motion.section
          className="mt-8 mb-4 relative z-10"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
        >
          <div className="px-4 sm:px-6 max-w-7xl mx-auto flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="w-1 h-7 rounded-full bg-gradient-to-b from-gold-400 to-gold-500 shadow-[0_0_12px_rgba(251,191,36,0.5)]" />
              <div>
                <h2 className="text-lg sm:text-xl font-display font-bold text-white">Trending Now</h2>
                <p className="text-[10px] sm:text-xs text-zayko-500">Most popular this week</p>
              </div>
            </div>
            <motion.span
              animate={{ scale: [1, 1.05, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="text-[10px] sm:text-xs font-bold text-gold-400 bg-gold-400/10 px-3 py-1 rounded-full border border-gold-400/20"
            >
              🔥 HOT
            </motion.span>
          </div>

          {/* Carousel */}
          <div ref={trendingRef} className="relative">
            <div className="flex overflow-x-auto no-scrollbar gap-4 px-4 sm:px-6 pb-4 snap-x snap-mandatory">
              {availableItems.slice(0, 6).map((item, idx) => (
                <motion.div
                  key={`trending-${item.id}`}
                  className="min-w-[200px] sm:min-w-[240px] shrink-0 snap-start carousel-glow-item"
                  initial={{ opacity: 0, x: 40 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.4, delay: idx * 0.08, ease: [0.22, 1, 0.36, 1] }}
                >
                  <MenuCard {...item} />
                </motion.div>
              ))}
            </div>
            {/* Edge fade gradients */}
            <div className="absolute top-0 left-0 w-8 h-full bg-gradient-to-r from-zayko-900 to-transparent pointer-events-none z-10" />
            <div className="absolute top-0 right-0 w-8 h-full bg-gradient-to-l from-zayko-900 to-transparent pointer-events-none z-10" />
          </div>
        </motion.section>
      )}

      {/* ══════════════════════════════════════
          SEARCH & FILTERS — Premium Sticky Bar
         ══════════════════════════════════════ */}
      <div className="sticky top-[56px] sm:top-[64px] z-30 backdrop-blur-2xl bg-zayko-900/80 border-b border-white/[0.04]">
        <div className="px-4 sm:px-6 max-w-7xl mx-auto py-3 space-y-3">
          {/* Search Input */}
          <div className="relative group">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zayko-400 text-sm group-focus-within:text-gold-400 transition-colors duration-200">🔍</span>
            <input
              type="text"
              placeholder="Search menu..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-11 pr-10 py-3 rounded-2xl bg-white/[0.05] border border-white/[0.06] text-white placeholder:text-zayko-500 focus:outline-none focus:ring-2 focus:ring-gold-400/25 focus:border-gold-400/25 focus:shadow-[0_0_30px_rgba(251,191,36,0.08)] text-sm transition-all duration-300 focus:bg-white/[0.08] backdrop-blur-md"
            />
            <AnimatePresence>
              {search && (
                <motion.button
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  onClick={() => setSearch("")}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zayko-400 hover:text-white transition-colors p-0.5"
                >
                  <div className="bg-white/10 hover:bg-white/20 rounded-full w-5 h-5 flex items-center justify-center text-[10px] transition-colors">✕</div>
                </motion.button>
              )}
            </AnimatePresence>
          </div>

          {/* Category Pills — Premium */}
          <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1 pb-0.5">
            <motion.button
              onClick={() => setCategory("all")}
              whileTap={{ scale: 0.93 }}
              className={`px-4 py-1.5 rounded-full text-xs sm:text-sm font-semibold whitespace-nowrap transition-all duration-300 shrink-0 ${category === "all" ? "category-pill-active" : "category-pill-inactive"
                }`}
            >
              All
            </motion.button>
            {categories.map((cat) => (
              <motion.button
                key={cat.id}
                onClick={() => setCategory(cat.slug)}
                whileTap={{ scale: 0.93 }}
                className={`px-4 py-1.5 rounded-full text-xs sm:text-sm font-semibold whitespace-nowrap transition-all duration-300 shrink-0 ${category === cat.slug ? "category-pill-active" : "category-pill-inactive"
                  }`}
              >
                {cat.name}
              </motion.button>
            ))}
          </div>

          {/* Item count + toggle */}
          <div className="flex items-center justify-between">
            <p className="text-[10px] sm:text-xs text-zayko-500 font-medium">{availableCount} items available</p>
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

      {/* ══════════════════════════════════════
          MENU GRID — Premium Layout
         ══════════════════════════════════════ */}
      <div className="px-4 sm:px-6 max-w-7xl mx-auto mt-5 sm:mt-6 space-y-8 sm:space-y-10 relative z-10">
        {menuLoading ? (
          /* Premium Loading Skeleton */
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-5">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="rounded-2xl overflow-hidden">
                <div className="skeleton-premium aspect-[4/3]" />
                <div className="p-4 space-y-2 bg-zayko-800/30">
                  <div className="skeleton-premium h-4 w-3/4" />
                  <div className="skeleton-premium h-3 w-1/2" />
                  <div className="skeleton-premium h-10 w-full mt-3" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredItems.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4 }}
            className="text-center py-16 sm:py-20 premium-glass-card"
          >
            <div className="text-5xl sm:text-6xl mb-3">🍽️</div>
            <h3 className="text-lg sm:text-xl font-display font-bold text-white mb-1">No items found</h3>
            <p className="text-sm text-zayko-400">
              {search ? `No results for "${search}"` : "The menu is empty right now"}
            </p>
          </motion.div>
        ) : (
          <>
            {/* ── Available Section ── */}
            {availableItems.length > 0 && (
              <section>
                <motion.div
                  className="flex items-center gap-3 mb-5"
                  initial={{ opacity: 0, x: -15 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.4 }}
                >
                  <div className="w-1 h-7 bg-gradient-to-b from-emerald-400 to-emerald-500 rounded-full shadow-[0_0_10px_rgba(16,185,129,0.4)]" />
                  <h2 className="text-lg sm:text-xl font-display font-bold text-white">Available Now</h2>
                  <span className="text-[10px] sm:text-xs text-emerald-400/70 bg-emerald-400/10 px-2 py-0.5 rounded-full font-semibold">{availableItems.length}</span>
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

            {/* ── Unavailable Section ── */}
            {showUnavailable && unavailableItems.length > 0 && (
              <section>
                <div className="flex items-center gap-3 mb-5 pt-4 sm:pt-6 border-t border-white/[0.04]">
                  <div className="w-1 h-7 bg-zayko-600 rounded-full" />
                  <h2 className="text-lg sm:text-xl font-display font-bold text-zayko-300">Not Available</h2>
                  <span className="text-[10px] sm:text-xs text-zayko-500 bg-white/[0.04] px-2 py-0.5 rounded-full font-semibold">{unavailableItems.length}</span>
                </div>
                <motion.div
                  className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-5"
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
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-zayko-400 italic text-sm text-center py-4"
              >
                All items are available! 🎉
              </motion.p>
            )}
          </>
        )}
      </div>

      {/* ══════════════════════════════════════
          FLOATING CART BAR — Premium
         ══════════════════════════════════════ */}
      <AnimatePresence>
        {itemCount > 0 && (
          <motion.div
            initial={{ y: 80, opacity: 0, scale: 0.9 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 80, opacity: 0, scale: 0.9 }}
            transition={{ type: "spring", stiffness: 300, damping: 28 }}
            className={`fixed bottom-20 md:bottom-4 left-3 right-3 sm:left-auto sm:right-6 sm:w-auto z-40 ${cartPulse ? 'neon-pulse' : ''}`}
          >
            <div className="flex gap-2">
              {/* Schedule Button */}
              <button
                onClick={() => setShowScheduleModal(true)}
                className="flex items-center gap-2 bg-white/[0.08] backdrop-blur-xl border border-white/[0.12] text-white px-3.5 sm:px-4 py-3.5 sm:py-4 rounded-2xl hover:bg-white/[0.14] hover:border-gold-400/30 hover:shadow-[0_0_20px_rgba(251,191,36,0.12)] transition-all duration-300 active:scale-[0.97] group"
              >
                <span className="text-base sm:text-lg">🗓️</span>
                <span className="text-[10px] sm:text-xs font-bold text-zayko-300 group-hover:text-gold-400 transition-colors hidden sm:inline">Schedule</span>
              </button>

              {/* Cart Button */}
              <Link
                href="/cart"
                className="flex-1 flex items-center justify-between gap-4 sm:gap-6 bg-gradient-to-r from-gold-400 via-gold-500 to-gold-400 text-zayko-900 px-5 sm:px-6 py-3.5 sm:py-4 rounded-2xl shadow-[0_8px_32px_rgba(251,191,36,0.35)] hover:shadow-[0_16px_48px_rgba(251,191,36,0.5)] transition-all duration-300 active:scale-[0.97] group"
              >
                <div className="flex items-center gap-3">
                  <motion.span
                    className="bg-zayko-900/20 w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center text-base sm:text-lg"
                    animate={cartPulse ? { rotate: [0, -10, 10, -5, 5, 0] } : {}}
                    transition={{ duration: 0.4 }}
                  >
                    🛒
                  </motion.span>
                  <div>
                    <p className="font-bold text-sm sm:text-base">{itemCount} item{itemCount > 1 ? "s" : ""}</p>
                    <p className="text-[10px] sm:text-xs text-zayko-900/60 group-hover:text-zayko-900/80 transition-colors">Tap to checkout →</p>
                  </div>
                </div>
                <span className="font-display font-bold text-lg sm:text-xl">₹{total}</span>
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Scheduled Order Modal */}
      <ScheduledOrderModal
        isOpen={showScheduleModal}
        onClose={() => setShowScheduleModal(false)}
      />
    </div>
  );
}
