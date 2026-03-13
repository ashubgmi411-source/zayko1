"use client";
import React, { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { db } from "@/lib/firebase";
import { collection, onSnapshot, query, where, orderBy } from "firebase/firestore";
import toast from "react-hot-toast";
import { useCountdown } from "@/hooks/useCountdown";
import { useOrderNotifications } from "@/hooks/useOrderNotifications";
import type { Order } from "@/types";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";

/* ─── Status Config ──────────────────────────────────────── */
const statusConfig: Record<string, { label: string; color: string; bg: string; icon: string }> = {
    pending: { label: "Pending", color: "text-amber-400", bg: "bg-amber-400/10", icon: "⏳" },
    confirmed: { label: "Confirmed", color: "text-blue-400", bg: "bg-blue-400/10", icon: "✅" },
    preparing: { label: "Preparing", color: "text-orange-400", bg: "bg-orange-400/10", icon: "👨‍🍳" },
    ready: { label: "Ready!", color: "text-emerald-400", bg: "bg-emerald-400/10", icon: "🎉" },
    completed: { label: "Completed", color: "text-zayko-400", bg: "bg-white/5", icon: "📦" },
    cancelled: { label: "Cancelled", color: "text-red-400", bg: "bg-red-400/10", icon: "✗" },
};

/* ─── Main Orders Page ───────────────────────────────────── */
export default function OrdersPage() {
    const { user, loading, profile } = useAuth();
    const router = useRouter();
    const [orders, setOrders] = useState<Order[]>([]);
    const [ordersLoading, setOrdersLoading] = useState(true);

    // Feedback Modal State
    const [feedbackOrder, setFeedbackOrder] = useState<Order | null>(null);
    const [rating, setRating] = useState(5);
    const [comment, setComment] = useState("");
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (!loading && !user) router.push("/auth");
    }, [user, loading, router]);

    useEffect(() => {
        if (!user) return;
        const q = query(
            collection(db, "orders"),
            where("userId", "==", user.uid),
            orderBy("createdAt", "desc")
        );
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const orderList = snapshot.docs.map((doc) => ({
                id: doc.id,
                ...doc.data(),
            })) as Order[];
            setOrders(orderList);
            setOrdersLoading(false);
        }, (error) => {
            console.error("Orders listener error:", error);
            setOrdersLoading(false);
        });
        return () => unsubscribe();
    }, [user]);

    const submitFeedback = async () => {
        if (!feedbackOrder || !user) return;
        setSubmitting(true);
        try {
            const res = await fetch("/api/feedbacks", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    orderId: feedbackOrder.id,
                    userId: user.uid,
                    userName: profile?.name || user.email || "User",
                    rating,
                    comment
                })
            });
            if (res.ok) {
                toast.success("Feedback submitted! ❤️");
                setFeedbackOrder(null);
                setRating(5);
                setComment("");
            } else {
                toast.error("Failed to submit feedback.");
            }
        } catch (err) {
            toast.error("Error submitting feedback.");
        } finally {
            setSubmitting(false);
        }
    };

    useOrderNotifications(orders);

    if (loading || ordersLoading) {
        return (
            <div className="min-h-screen bg-zayko-900 flex items-center justify-center">
                <div className="w-10 h-10 border-4 border-gold-400 border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    const activeStatuses = ["pending", "confirmed", "preparing", "ready"];
    const activeOrders = orders.filter((o) => activeStatuses.includes(o.status));
    const pastOrders = orders.filter((o) => !activeStatuses.includes(o.status));

    return (
        <div className="min-h-screen bg-zayko-900 pb-28 md:pb-24">
            {/* ─── Header ─── */}
            <div className="bg-zayko-800/80 backdrop-blur-xl border-b border-white/[0.06] px-4 py-4 sm:px-6 sticky top-0 z-40">
                <div className="max-w-3xl mx-auto flex items-center justify-between">
                    <div>
                        <h1 className="text-xl font-display font-bold text-white">My Orders 📋</h1>
                        <p className="text-xs text-zayko-400 mt-0.5">{orders.length} orders total</p>
                    </div>
                    <Link
                        href="/orders/scheduled"
                        className="px-4 py-2 bg-blue-500/15 text-blue-400 border border-blue-500/20 rounded-xl text-xs font-bold hover:bg-blue-500/25 transition-all flex items-center gap-1.5"
                    >
                        🗓️ Scheduled
                    </Link>
                </div>
            </div>

            <div className="px-4 sm:px-6 max-w-3xl mx-auto py-6">
                {orders.length === 0 ? (
                    <div className="text-center py-20 bg-white/[0.03] rounded-3xl border border-white/[0.05]">
                        <div className="text-6xl mb-4">📋</div>
                        <h3 className="text-xl font-display font-bold text-white mb-2">No orders yet</h3>
                        <p className="text-zayko-400 mb-6">Your hungry stomach is waiting...</p>
                        <Link href="/" className="px-6 py-3 bg-gold-400 text-zayko-900 rounded-xl font-bold shadow-lg shadow-gold-400/20 active:scale-95 transition-all inline-block">
                            Order Something 🍽️
                        </Link>
                    </div>
                ) : (
                    <div className="space-y-8">
                        {/* Active Orders */}
                        {activeOrders.length > 0 && (
                            <div>
                                <h2 className="text-xs font-bold text-emerald-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                                    <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.5)]"></span>
                                    Active Orders
                                </h2>
                                <div className="space-y-5">
                                    {activeOrders.map((order) => (
                                        <OrderCard key={order.id} order={order} />
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Past Orders */}
                        {pastOrders.length > 0 && (
                            <div>
                                <h2 className="text-xs font-bold text-zayko-500 uppercase tracking-widest mb-4">
                                    Past Orders
                                </h2>
                                <div className="space-y-4">
                                    {pastOrders.map((order) => (
                                        <OrderCard key={order.id} order={order} onReview={() => setFeedbackOrder(order)} />
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Feedback Modal */}
            <AnimatePresence>
                {feedbackOrder && (
                    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-md">
                        <motion.div
                            initial={{ y: "100%" }}
                            animate={{ y: 0 }}
                            exit={{ y: "100%" }}
                            transition={{ type: "spring", damping: 25, stiffness: 300 }}
                            className="bg-zayko-800 rounded-t-3xl sm:rounded-3xl w-full max-w-md overflow-hidden"
                        >
                            <div className="p-6">
                                <div className="w-12 h-1.5 bg-zayko-700 rounded-full mx-auto mb-6 sm:hidden" />
                                <h3 className="text-xl font-display font-bold text-white mb-1">Rate Order #{feedbackOrder.orderId}</h3>
                                <p className="text-zayko-400 text-sm mb-8">How was your food experience?</p>

                                <div className="flex items-center justify-center gap-3 mb-8 text-4xl">
                                    {[1, 2, 3, 4, 5].map((star) => (
                                        <button
                                            key={star}
                                            onClick={() => setRating(star)}
                                            className={`transition-all active:scale-75 ${star <= rating ? "text-gold-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.5)] scale-110" : "text-zayko-700"}`}
                                        >
                                            ★
                                        </button>
                                    ))}
                                </div>

                                <textarea
                                    value={comment}
                                    onChange={(e) => setComment(e.target.value)}
                                    placeholder="Tell us more about the taste... (optional)"
                                    className="w-full h-32 p-4 bg-white/5 border border-white/10 rounded-2xl text-sm text-white placeholder:text-zayko-600 focus:ring-2 focus:ring-gold-400/30 focus:border-gold-400/30 outline-none resize-none mb-6 transition-all"
                                />

                                <div className="flex gap-3 pb-safe">
                                    <button
                                        onClick={() => setFeedbackOrder(null)}
                                        className="flex-1 py-4 text-sm font-bold text-zayko-400 hover:text-white transition-colors"
                                    >
                                        Skip
                                    </button>
                                    <button
                                        onClick={submitFeedback}
                                        disabled={submitting}
                                        className="flex-[2] py-4 bg-gold-400 text-zayko-900 font-display font-bold rounded-2xl hover:bg-gold-500 shadow-lg shadow-gold-400/10 transition-all disabled:opacity-50 active:scale-95"
                                    >
                                        {submitting ? "Sending..." : "Submit Review"}
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}

/* ─── Order Card Component ───────────────────────────────── */
function OrderCard({ order, onReview }: { order: Order; onReview?: () => void }) {
    const st = statusConfig[order.status] || statusConfig.pending;
    const { formatted, isExpired } = useCountdown(order.readyAt || order.estimatedReadyAt);

    return (
        <div className={`bg-zayko-800/40 border border-white/[0.06] rounded-2xl overflow-hidden transition-all duration-300 ${order.status === "ready" ? "ring-2 ring-emerald-400/50 scale-[1.01]" : ""}`}>
            {/* Header */}
            <div className="p-4 border-b border-white/[0.04]">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <span className="text-xl">{st.icon}</span>
                        <div>
                            <h3 className="text-sm font-bold text-white leading-none mb-1">Order #{order.orderId}</h3>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${st.bg} ${st.color}`}>
                                {st.label}
                            </span>
                        </div>
                    </div>
                    <span className="font-display font-bold text-lg text-white">₹{order.total}</span>
                </div>

                {/* Status-specific progress/countdown */}
                {order.status === "ready" ? (
                    <div className="p-3 rounded-xl bg-emerald-400/10 border border-emerald-400/20">
                        <p className="text-emerald-400 text-xs font-bold flex items-center gap-1.5">
                            <span className="animate-bounce">🍜</span> Your food is ready for pickup!
                        </p>
                    </div>
                ) : (order.status === "preparing" || order.status === "confirmed") && (order.readyAt || order.estimatedReadyAt) ? (
                    <div className="p-3 rounded-xl bg-orange-400/5 border border-white/[0.04]">
                        <div className="flex justify-between items-center">
                            <p className="text-[10px] text-zayko-400 uppercase font-bold tracking-tight">Estimated Prep Time</p>
                            <span className={`text-sm font-bold tabular-nums ${isExpired ? "text-amber-400 animate-pulse" : "text-orange-400"}`}>
                                {isExpired ? "Almost ready..." : formatted}
                            </span>
                        </div>
                    </div>
                ) : order.status === "completed" ? (
                    <p className="text-[10px] text-zayko-500 italic px-1">Delivered on {new Date(order.createdAt).toLocaleDateString()}</p>
                ) : null}
            </div>

            {/* Items */}
            <div className="px-4 py-3 bg-white/[0.02]">
                <div className="space-y-1.5">
                    {order.items.map((item, idx) => (
                        <div key={idx} className="flex justify-between text-xs">
                            <span className="text-zayko-300">
                                <span className="font-bold text-white">{item.quantity}x</span> {item.name}
                            </span>
                            <span className="text-zayko-500">₹{item.price * item.quantity}</span>
                        </div>
                    ))}
                </div>

                {order.status === "completed" && onReview && (
                    <button
                        onClick={onReview}
                        className="mt-4 w-full py-2.5 border border-white/10 text-white rounded-xl text-xs font-bold hover:bg-white/5 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                    >
                        ⭐ Rate Your Food
                    </button>
                )}
            </div>

            <div className="px-4 py-2 border-t border-white/[0.04]">
                <p className="text-[10px] text-zayko-500 text-right">
                    {new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
            </div>
        </div>
    );
}
