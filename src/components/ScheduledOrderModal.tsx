/**
 * ScheduledOrderModal — Schedule a one-time future order
 *
 * Uses items from the current cart, lets user pick date/time and payment method,
 * then creates a scheduled order via the API. Also shows existing scheduled orders
 * with the ability to cancel them.
 */

"use client";
import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/context/AuthContext";
import { useCart } from "@/context/CartContext";
import {
    createScheduledOrder,
    getScheduledOrders,
    cancelScheduledOrder,
} from "@/services/scheduledOrderService";
import type { ScheduledOrder, ScheduledOrderItem } from "@/types";
import toast from "react-hot-toast";

interface ScheduledOrderModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function ScheduledOrderModal({
    isOpen,
    onClose,
}: ScheduledOrderModalProps) {
    const { user, profile, getIdToken } = useAuth();
    const { items: cartItems, total: cartTotal, clearCart } = useCart();

    const [date, setDate] = useState("");
    const [time, setTime] = useState("");
    const [paymentMethod, setPaymentMethod] = useState<"wallet" | "razorpay">("wallet");
    const [submitting, setSubmitting] = useState(false);
    const [scheduledOrders, setScheduledOrders] = useState<ScheduledOrder[]>([]);
    const [loadingOrders, setLoadingOrders] = useState(false);
    const [activeTab, setActiveTab] = useState<"create" | "history">("create");
    const [cancellingId, setCancellingId] = useState<string | null>(null);

    // Set minimum date to tomorrow
    const getMinDate = () => {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        return tomorrow.toISOString().split("T")[0];
    };

    // Fetch user's scheduled orders
    const fetchScheduledOrders = useCallback(async () => {
        if (!user) return;
        setLoadingOrders(true);
        try {
            const token = await getIdToken();
            if (!token) return;
            const res = await getScheduledOrders(token, user.uid);
            if (res.success && res.scheduledOrders) {
                setScheduledOrders(res.scheduledOrders);
            }
        } catch {
            console.error("Failed to fetch scheduled orders");
        } finally {
            setLoadingOrders(false);
        }
    }, [user, getIdToken]);

    useEffect(() => {
        if (isOpen) fetchScheduledOrders();
    }, [isOpen, fetchScheduledOrders]);

    const handleSubmit = async () => {
        if (!user || !profile) {
            toast.error("Please login first");
            return;
        }

        if (cartItems.length === 0) {
            toast.error("Your cart is empty! Add items first.");
            return;
        }

        if (!date || !time) {
            toast.error("Please select both date and time");
            return;
        }

        const scheduledDateTime = new Date(`${date}T${time}:00`);
        if (scheduledDateTime.getTime() <= Date.now()) {
            toast.error("Scheduled time must be in the future");
            return;
        }

        setSubmitting(true);
        try {
            const token = await getIdToken();
            if (!token) {
                toast.error("Authentication failed");
                return;
            }

            const orderItems: ScheduledOrderItem[] = cartItems.map((item) => ({
                itemId: item.id,
                name: item.name,
                quantity: item.quantity,
                price: item.price,
            }));

            const res = await createScheduledOrder(token, {
                userId: user.uid,
                items: orderItems,
                scheduledDateTime: scheduledDateTime.toISOString(),
                paymentMethod,
            });

            if (res.success) {
                toast.success("Order scheduled successfully! 🗓️");
                clearCart();
                setDate("");
                setTime("");
                fetchScheduledOrders();
                setActiveTab("history");
            } else {
                toast.error(res.error || "Failed to schedule order");
            }
        } catch (err) {
            toast.error("Something went wrong");
            console.error(err);
        } finally {
            setSubmitting(false);
        }
    };

    const handleCancel = async (orderId: string) => {
        if (!user) return;
        setCancellingId(orderId);
        try {
            const token = await getIdToken();
            if (!token) return;
            const res = await cancelScheduledOrder(token, orderId);
            if (res.success) {
                toast.success("Scheduled order cancelled");
                fetchScheduledOrders();
            } else {
                toast.error(res.error || "Failed to cancel");
            }
        } catch {
            toast.error("Failed to cancel order");
        } finally {
            setCancellingId(null);
        }
    };

    const formatDateTime = (iso: string) => {
        const d = new Date(iso);
        return d.toLocaleString("en-IN", {
            day: "numeric",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            hour12: true,
        });
    };

    const statusColors: Record<string, string> = {
        scheduled: "text-amber-400 bg-amber-400/10 border-amber-400/20",
        completed: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20",
        failed: "text-red-400 bg-red-400/10 border-red-400/20",
        cancelled: "text-zinc-400 bg-zinc-400/10 border-zinc-400/20",
    };

    const statusIcons: Record<string, string> = {
        scheduled: "🕐",
        completed: "✅",
        failed: "❌",
        cancelled: "🚫",
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4"
                    onClick={onClose}
                >
                    {/* Backdrop */}
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

                    {/* Modal */}
                    <motion.div
                        initial={{ y: 100, opacity: 0, scale: 0.95 }}
                        animate={{ y: 0, opacity: 1, scale: 1 }}
                        exit={{ y: 100, opacity: 0, scale: 0.95 }}
                        transition={{ type: "spring", stiffness: 300, damping: 30 }}
                        onClick={(e) => e.stopPropagation()}
                        className="relative w-full sm:max-w-md max-h-[85vh] bg-zayko-900 border border-white/[0.08] rounded-t-3xl sm:rounded-3xl shadow-[0_-10px_40px_rgba(0,0,0,0.5)] overflow-hidden flex flex-col"
                    >
                        {/* Header */}
                        <div className="px-5 pt-5 pb-3 border-b border-white/[0.06] shrink-0">
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-gold-400/20 to-amber-500/10 flex items-center justify-center text-xl border border-gold-400/20">
                                        🗓️
                                    </div>
                                    <div>
                                        <h2 className="text-lg font-display font-bold text-white">
                                            Schedule Order
                                        </h2>
                                        <p className="text-[10px] text-zayko-500">
                                            Auto-order at your chosen time
                                        </p>
                                    </div>
                                </div>
                                <button
                                    onClick={onClose}
                                    className="w-8 h-8 rounded-full bg-white/[0.06] hover:bg-white/[0.12] flex items-center justify-center text-zayko-400 hover:text-white transition-all text-sm"
                                >
                                    ✕
                                </button>
                            </div>

                            {/* Tab Switcher */}
                            <div className="flex gap-1 bg-white/[0.04] rounded-xl p-1">
                                <button
                                    onClick={() => setActiveTab("create")}
                                    className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all duration-200 ${
                                        activeTab === "create"
                                            ? "bg-gold-400/20 text-gold-400 shadow-sm"
                                            : "text-zayko-500 hover:text-zayko-300"
                                    }`}
                                >
                                    📝 New Schedule
                                </button>
                                <button
                                    onClick={() => setActiveTab("history")}
                                    className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all duration-200 ${
                                        activeTab === "history"
                                            ? "bg-gold-400/20 text-gold-400 shadow-sm"
                                            : "text-zayko-500 hover:text-zayko-300"
                                    }`}
                                >
                                    📋 My Schedules
                                    {scheduledOrders.filter((o) => o.status === "scheduled").length > 0 && (
                                        <span className="ml-1.5 bg-gold-400 text-zayko-900 text-[9px] font-black px-1.5 py-0.5 rounded-full">
                                            {scheduledOrders.filter((o) => o.status === "scheduled").length}
                                        </span>
                                    )}
                                </button>
                            </div>
                        </div>

                        {/* Body — Scrollable */}
                        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                            {activeTab === "create" ? (
                                <>
                                    {/* Cart Items Preview */}
                                    <div>
                                        <label className="text-xs font-bold text-zayko-400 uppercase tracking-wider mb-2 block">
                                            Items from Cart
                                        </label>
                                        {cartItems.length === 0 ? (
                                            <div className="text-center py-8 bg-white/[0.02] rounded-2xl border border-white/[0.06]">
                                                <span className="text-3xl mb-2 block">🛒</span>
                                                <p className="text-sm text-zayko-500">
                                                    Your cart is empty
                                                </p>
                                                <p className="text-xs text-zayko-600 mt-1">
                                                    Add items from the menu first
                                                </p>
                                            </div>
                                        ) : (
                                            <div className="space-y-2">
                                                {cartItems.map((item) => (
                                                    <div
                                                        key={item.id}
                                                        className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]"
                                                    >
                                                        <div className="flex items-center gap-3 min-w-0">
                                                            <span className="text-lg">🍽️</span>
                                                            <div className="min-w-0">
                                                                <p className="text-sm font-semibold text-white truncate">
                                                                    {item.name}
                                                                </p>
                                                                <p className="text-[10px] text-zayko-500">
                                                                    ₹{item.price} × {item.quantity}
                                                                </p>
                                                            </div>
                                                        </div>
                                                        <span className="text-sm font-bold text-gold-400 shrink-0">
                                                            ₹{item.price * item.quantity}
                                                        </span>
                                                    </div>
                                                ))}

                                                {/* Total */}
                                                <div className="flex items-center justify-between pt-2 border-t border-white/[0.06]">
                                                    <span className="text-xs font-bold text-zayko-400">
                                                        Total
                                                    </span>
                                                    <span className="text-base font-display font-bold text-gold-400">
                                                        ₹{cartTotal}
                                                    </span>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Date & Time Pickers */}
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="text-xs font-bold text-zayko-400 uppercase tracking-wider mb-1.5 block">
                                                📅 Date
                                            </label>
                                            <input
                                                type="date"
                                                value={date}
                                                min={getMinDate()}
                                                onChange={(e) => setDate(e.target.value)}
                                                className="w-full px-3 py-2.5 rounded-xl bg-white/[0.05] border border-white/[0.08] text-white text-sm focus:outline-none focus:ring-2 focus:ring-gold-400/25 focus:border-gold-400/25 transition-all [color-scheme:dark]"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-xs font-bold text-zayko-400 uppercase tracking-wider mb-1.5 block">
                                                ⏰ Time
                                            </label>
                                            <input
                                                type="time"
                                                value={time}
                                                onChange={(e) => setTime(e.target.value)}
                                                className="w-full px-3 py-2.5 rounded-xl bg-white/[0.05] border border-white/[0.08] text-white text-sm focus:outline-none focus:ring-2 focus:ring-gold-400/25 focus:border-gold-400/25 transition-all [color-scheme:dark]"
                                            />
                                        </div>
                                    </div>

                                    {/* Payment Method */}
                                    <div>
                                        <label className="text-xs font-bold text-zayko-400 uppercase tracking-wider mb-2 block">
                                            💳 Payment Method
                                        </label>
                                        <div className="space-y-2">
                                            <button
                                                onClick={() => setPaymentMethod("wallet")}
                                                className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all duration-200 ${
                                                    paymentMethod === "wallet"
                                                        ? "bg-gold-400/10 border-gold-400/30 shadow-[0_0_20px_rgba(251,191,36,0.08)]"
                                                        : "bg-white/[0.03] border-white/[0.06] hover:border-white/[0.12]"
                                                }`}
                                            >
                                                <span className="text-lg">💰</span>
                                                <div className="text-left flex-1">
                                                    <p className="text-sm font-semibold text-white">
                                                        Wallet
                                                    </p>
                                                    <p className="text-[10px] text-zayko-500">
                                                        Balance: ₹{profile?.walletBalance || 0}
                                                    </p>
                                                </div>
                                                <div
                                                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                                                        paymentMethod === "wallet"
                                                            ? "border-gold-400 bg-gold-400"
                                                            : "border-zayko-600"
                                                    }`}
                                                >
                                                    {paymentMethod === "wallet" && (
                                                        <span className="text-[10px] text-zayko-900">✓</span>
                                                    )}
                                                </div>
                                            </button>

                                            <button
                                                onClick={() => setPaymentMethod("razorpay")}
                                                className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all duration-200 ${
                                                    paymentMethod === "razorpay"
                                                        ? "bg-blue-400/10 border-blue-400/30"
                                                        : "bg-white/[0.03] border-white/[0.06] hover:border-white/[0.12]"
                                                } opacity-50 cursor-not-allowed`}
                                                disabled
                                            >
                                                <span className="text-lg">💳</span>
                                                <div className="text-left flex-1">
                                                    <p className="text-sm font-semibold text-white">
                                                        Razorpay
                                                    </p>
                                                    <p className="text-[10px] text-zayko-500">
                                                        Coming soon — pre-authorized payments
                                                    </p>
                                                </div>
                                                <span className="text-[9px] font-bold text-blue-400 bg-blue-400/10 px-2 py-0.5 rounded-full">
                                                    SOON
                                                </span>
                                            </button>
                                        </div>
                                    </div>

                                    {/* Wallet Balance Warning */}
                                    {paymentMethod === "wallet" &&
                                        profile &&
                                        cartTotal > (profile.walletBalance || 0) && (
                                            <div className="flex items-start gap-2 p-3 rounded-xl bg-red-400/10 border border-red-400/20">
                                                <span className="text-sm mt-0.5">⚠️</span>
                                                <div>
                                                    <p className="text-xs font-bold text-red-400">
                                                        Insufficient Balance
                                                    </p>
                                                    <p className="text-[10px] text-red-400/70 mt-0.5">
                                                        You need ₹{cartTotal} but have ₹
                                                        {profile.walletBalance || 0}. Top up your wallet
                                                        before the scheduled time.
                                                    </p>
                                                </div>
                                            </div>
                                        )}

                                    {/* Info Note */}
                                    <div className="flex items-start gap-2 p-3 rounded-xl bg-blue-400/5 border border-blue-400/10">
                                        <span className="text-sm mt-0.5">ℹ️</span>
                                        <p className="text-[10px] text-zayko-500 leading-relaxed">
                                            Your order will be automatically placed at the scheduled
                                            time. Wallet balance will be checked at execution time. If
                                            insufficient, the order will be marked as failed.
                                        </p>
                                    </div>
                                </>
                            ) : (
                                /* History Tab */
                                <div>
                                    {loadingOrders ? (
                                        <div className="flex items-center justify-center py-12">
                                            <div className="w-6 h-6 border-2 border-gold-400 border-t-transparent rounded-full animate-spin" />
                                        </div>
                                    ) : scheduledOrders.length === 0 ? (
                                        <div className="text-center py-12">
                                            <span className="text-4xl block mb-3">📭</span>
                                            <p className="text-sm font-semibold text-zayko-400">
                                                No scheduled orders yet
                                            </p>
                                            <p className="text-xs text-zayko-600 mt-1">
                                                Schedule your first order from the &quot;New Schedule&quot; tab
                                            </p>
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            {scheduledOrders.map((order) => (
                                                <div
                                                    key={order.id}
                                                    className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.06] space-y-2.5"
                                                >
                                                    {/* Status + Date */}
                                                    <div className="flex items-center justify-between">
                                                        <span
                                                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                                                                statusColors[order.status] || ""
                                                            }`}
                                                        >
                                                            {statusIcons[order.status]}{" "}
                                                            {order.status.toUpperCase()}
                                                        </span>
                                                        <span className="text-[10px] text-zayko-500">
                                                            {formatDateTime(order.scheduledDateTime)}
                                                        </span>
                                                    </div>

                                                    {/* Items */}
                                                    <div className="space-y-1">
                                                        {order.items.map(
                                                            (item, idx) => (
                                                                <div
                                                                    key={idx}
                                                                    className="flex items-center justify-between text-xs"
                                                                >
                                                                    <span className="text-zayko-300">
                                                                        {item.name} × {item.quantity}
                                                                    </span>
                                                                    <span className="text-zayko-400 font-semibold">
                                                                        ₹{item.price * item.quantity}
                                                                    </span>
                                                                </div>
                                                            )
                                                        )}
                                                    </div>

                                                    {/* Total + Actions */}
                                                    <div className="flex items-center justify-between pt-2 border-t border-white/[0.04]">
                                                        <span className="text-xs font-bold text-gold-400">
                                                            Total: ₹
                                                            {order.items.reduce(
                                                                (s, i) => s + i.price * i.quantity,
                                                                0
                                                            )}
                                                        </span>
                                                        {order.status === "scheduled" && (
                                                            <button
                                                                onClick={() => handleCancel(order.id)}
                                                                disabled={cancellingId === order.id}
                                                                className="text-[10px] font-bold text-red-400 hover:text-red-300 bg-red-400/10 hover:bg-red-400/20 px-3 py-1 rounded-lg border border-red-400/20 transition-all disabled:opacity-50"
                                                            >
                                                                {cancellingId === order.id
                                                                    ? "Cancelling..."
                                                                    : "Cancel"}
                                                            </button>
                                                        )}
                                                        {order.status === "failed" &&
                                                            order.failureReason && (
                                                                <span className="text-[10px] text-red-400/70 max-w-[150px] truncate">
                                                                    {order.failureReason}
                                                                </span>
                                                            )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Footer — Confirm Button (only on create tab) */}
                        {activeTab === "create" && (
                            <div className="px-5 py-4 border-t border-white/[0.06] shrink-0 bg-zayko-900/90 backdrop-blur-xl">
                                <button
                                    onClick={handleSubmit}
                                    disabled={
                                        submitting ||
                                        cartItems.length === 0 ||
                                        !date ||
                                        !time
                                    }
                                    className="w-full py-3.5 rounded-2xl font-bold text-sm transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed bg-gradient-to-r from-gold-400 via-gold-500 to-gold-400 text-zayko-900 hover:shadow-[0_0_30px_rgba(251,191,36,0.3)] active:scale-[0.98]"
                                >
                                    {submitting ? (
                                        <span className="flex items-center justify-center gap-2">
                                            <span className="w-4 h-4 border-2 border-zayko-900 border-t-transparent rounded-full animate-spin" />
                                            Scheduling...
                                        </span>
                                    ) : (
                                        `Schedule Order · ₹${cartTotal}`
                                    )}
                                </button>
                            </div>
                        )}
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
