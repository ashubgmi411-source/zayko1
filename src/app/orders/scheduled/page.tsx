"use client";

import React, { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import Link from "next/link";
import toast from "react-hot-toast";
import { motion, AnimatePresence } from "framer-motion";
import type { ScheduledOrder } from "@/types";
import { getScheduledOrders, cancelScheduledOrder } from "@/services/scheduledOrderService";

const statusConfig: Record<string, { label: string; color: string; bg: string; icon: string }> = {
    scheduled: { label: "Scheduled", color: "text-blue-400", bg: "bg-blue-400/10", icon: "🗓️" },
    completed: { label: "Completed", color: "text-emerald-400", bg: "bg-emerald-400/10", icon: "✅" },
    failed: { label: "Failed", color: "text-red-400", bg: "bg-red-400/10", icon: "❌" },
    cancelled: { label: "Cancelled", color: "text-zayko-400", bg: "bg-white/5", icon: "✗" },
};

export default function ScheduledOrdersPage() {
    const { user, loading } = useAuth();
    const router = useRouter();
    const [orders, setOrders] = useState<ScheduledOrder[]>([]);
    const [ordersLoading, setOrdersLoading] = useState(true);
    const [cancellingId, setCancellingId] = useState<string | null>(null);

    useEffect(() => {
        if (!loading && !user) router.push("/auth");
    }, [user, loading, router]);

    useEffect(() => {
        if (!user) return;
        fetchOrders();
    }, [user]);

    const fetchOrders = async () => {
        if (!user) return;
        setOrdersLoading(true);
        try {
            const token = await user.getIdToken();
            const res = await getScheduledOrders(token, user.uid);
            if (res.scheduledOrders) {
                setOrders(res.scheduledOrders);
            }
        } catch {
            toast.error("Failed to load scheduled orders");
        } finally {
            setOrdersLoading(false);
        }
    };

    const handleCancel = async (orderId: string) => {
        if (!user) return;
        if (!confirm("Cancel this scheduled order?")) return;

        setCancellingId(orderId);
        try {
            const token = await user.getIdToken();
            const res = await cancelScheduledOrder(token, orderId);
            if (res.success) {
                toast.success("Order cancelled");
                fetchOrders();
            } else {
                toast.error(res.error || "Failed to cancel");
            }
        } catch {
            toast.error("Error cancelling order");
        } finally {
            setCancellingId(null);
        }
    };

    if (loading || ordersLoading) {
        return (
            <div className="min-h-screen bg-zayko-900 flex items-center justify-center">
                <div className="w-10 h-10 border-4 border-gold-400 border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    const upcoming = orders.filter((o) => o.status === "scheduled");
    const past = orders.filter((o) => o.status !== "scheduled");

    return (
        <div className="min-h-screen bg-zayko-900 pb-28 md:pb-24">
            {/* Header */}
            <div className="bg-zayko-800/80 backdrop-blur-xl border-b border-white/[0.06] px-4 py-4 sm:px-6 sticky top-0 z-40">
                <div className="max-w-3xl mx-auto">
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                            <Link href="/orders" className="text-zayko-400 hover:text-white transition-colors text-sm">
                                ← Orders
                            </Link>
                            <div>
                                <h1 className="text-xl font-display font-bold text-white">Scheduled Orders 🗓️</h1>
                                <p className="text-xs text-zayko-400 mt-0.5">{orders.length} scheduled orders</p>
                            </div>
                        </div>
                        <button
                            onClick={fetchOrders}
                            className="px-3 py-2 bg-gold-400/10 text-gold-400 rounded-xl text-xs font-bold hover:bg-gold-400/20 transition-all"
                        >
                            🔄 Refresh
                        </button>
                    </div>

                    {/* Quick tip */}
                    <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl">
                        <p className="text-xs text-blue-400">
                            💡 Schedule orders from the <Link href="/" className="underline font-bold">Menu</Link> page using the 🗓️ button on the cart bar. Your order will be auto-placed at the scheduled time.
                        </p>
                    </div>
                </div>
            </div>

            <div className="px-4 sm:px-6 max-w-3xl mx-auto py-6">
                {orders.length === 0 ? (
                    <div className="text-center py-20 bg-white/[0.03] rounded-3xl border border-white/[0.05]">
                        <div className="text-6xl mb-4">🗓️</div>
                        <h3 className="text-xl font-display font-bold text-white mb-2">No Scheduled Orders</h3>
                        <p className="text-zayko-400 mb-6 text-sm">
                            You haven&apos;t scheduled any orders yet.
                        </p>
                        <Link
                            href="/"
                            className="px-6 py-3 bg-gold-400 text-zayko-900 rounded-xl font-bold shadow-lg shadow-gold-400/20 active:scale-95 transition-all inline-block"
                        >
                            Go to Menu 🍽️
                        </Link>
                    </div>
                ) : (
                    <div className="space-y-8">
                        {/* Upcoming */}
                        {upcoming.length > 0 && (
                            <div>
                                <h2 className="text-xs font-bold text-blue-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                                    <span className="w-2 h-2 bg-blue-400 rounded-full animate-pulse shadow-[0_0_8px_rgba(96,165,250,0.5)]" />
                                    Upcoming Scheduled
                                </h2>
                                <div className="space-y-4">
                                    <AnimatePresence>
                                        {upcoming.map((order) => (
                                            <ScheduledOrderCard
                                                key={order.id}
                                                order={order}
                                                onCancel={handleCancel}
                                                cancelling={cancellingId === order.id}
                                            />
                                        ))}
                                    </AnimatePresence>
                                </div>
                            </div>
                        )}

                        {/* Past */}
                        {past.length > 0 && (
                            <div>
                                <h2 className="text-xs font-bold text-zayko-500 uppercase tracking-widest mb-4">
                                    Past Scheduled Orders
                                </h2>
                                <div className="space-y-4">
                                    {past.map((order) => (
                                        <ScheduledOrderCard key={order.id} order={order} />
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

/* ─── Scheduled Order Card ─────────────────────── */
function ScheduledOrderCard({
    order,
    onCancel,
    cancelling,
}: {
    order: ScheduledOrder;
    onCancel?: (id: string) => void;
    cancelling?: boolean;
}) {
    const st = statusConfig[order.status] || statusConfig.scheduled;
    const scheduledDate = new Date(order.scheduledDateTime);
    const total = order.items.reduce((s, i) => s + i.price * i.quantity, 0);

    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-zayko-800/40 border border-white/[0.06] rounded-2xl overflow-hidden"
        >
            {/* Header */}
            <div className="p-4 border-b border-white/[0.04]">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <span className="text-xl">{st.icon}</span>
                        <div>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${st.bg} ${st.color}`}>
                                {st.label}
                            </span>
                        </div>
                    </div>
                    <span className="font-display font-bold text-lg text-white">₹{total}</span>
                </div>

                {/* Date/Time */}
                <div className="p-3 rounded-xl bg-blue-400/5 border border-white/[0.04]">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-[10px] text-zayko-400 uppercase font-bold tracking-tight mb-0.5">Scheduled For</p>
                            <p className="text-sm font-bold text-white">
                                {scheduledDate.toLocaleDateString("en-IN", {
                                    weekday: "short",
                                    day: "numeric",
                                    month: "short",
                                })}
                            </p>
                        </div>
                        <div className="text-right">
                            <p className="text-sm font-bold text-gold-400">
                                {scheduledDate.toLocaleTimeString("en-IN", {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                })}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Failure reason */}
                {order.status === "failed" && order.failureReason && (
                    <div className="mt-2 p-2.5 bg-red-500/10 border border-red-500/20 rounded-xl">
                        <p className="text-[10px] text-red-400 font-medium">⚠️ {order.failureReason}</p>
                    </div>
                )}
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

                {/* Cancel button — only for scheduled orders */}
                {order.status === "scheduled" && onCancel && (
                    <button
                        onClick={() => onCancel(order.id)}
                        disabled={cancelling}
                        className="mt-4 w-full py-2.5 border border-red-500/20 text-red-400 rounded-xl text-xs font-bold hover:bg-red-500/10 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                        {cancelling ? (
                            <>
                                <span className="w-3 h-3 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                                Cancelling...
                            </>
                        ) : (
                            "✕ Cancel Order"
                        )}
                    </button>
                )}
            </div>

            {/* Footer timestamp */}
            <div className="px-4 py-2 border-t border-white/[0.04]">
                <p className="text-[10px] text-zayko-500 text-right">
                    Created {new Date(order.createdAt).toLocaleString("en-IN", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                    })}
                </p>
            </div>
        </motion.div>
    );
}
