"use client";
import React, { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { db } from "@/lib/firebase";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import toast from "react-hot-toast";
import Link from "next/link";
import { MenuItem } from "@/types";

const ALL_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

interface DemandLocal {
    id: string;
    itemId: string;
    itemName: string;
    quantity: number;
    days: string[];
    isActive: boolean;
}

export default function DailyNeedsPage() {
    const { user, loading, getIdToken } = useAuth();
    const router = useRouter();

    const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
    const [demands, setDemands] = useState<DemandLocal[]>([]);
    const [fetching, setFetching] = useState(true);

    // Form
    const [selectedItem, setSelectedItem] = useState("");
    const [qty, setQty] = useState(1);
    const [selectedDays, setSelectedDays] = useState<string[]>([]);
    const [daily, setDaily] = useState(false);
    const [saving, setSaving] = useState(false);

    // Edit
    const [editId, setEditId] = useState<string | null>(null);
    const [editQty, setEditQty] = useState(1);
    const [editDays, setEditDays] = useState<string[]>([]);
    const [editSaving, setEditSaving] = useState(false);

    useEffect(() => {
        if (!loading && !user) router.push("/auth");
    }, [user, loading, router]);

    // Menu items (real-time)
    useEffect(() => {
        const q = query(collection(db, "menuItems"));
        const unsub = onSnapshot(q, (snap) => {
            setMenuItems((snap.docs.map((d) => ({ id: d.id, ...d.data() })) as MenuItem[]).filter((i) => i.available));
        });
        return () => unsub();
    }, []);

    // Real-time demands via onSnapshot
    useEffect(() => {
        if (!user) return;
        setFetching(true);
        const q = query(
            collection(db, "dailyDemands"),
            where("userId", "==", user.uid)
        );
        const unsub = onSnapshot(
            q,
            (snap) => {
                const items = snap.docs.map((d) => ({
                    id: d.id,
                    ...d.data(),
                    isActive: d.data().isActive !== false, // default true for old docs
                })) as DemandLocal[];
                // Sort by createdAt descending in JS (avoids composite index)
                items.sort((a: any, b: any) => (b.createdAt || "").localeCompare(a.createdAt || ""));
                setDemands(items);
                setFetching(false);
            },
            (err) => {
                console.error("[DailyNeeds] onSnapshot error:", err);
                setFetching(false);
            }
        );
        return () => unsub();
    }, [user]);

    const toggleDay = (day: string) => {
        setDaily(false);
        setSelectedDays((p) => p.includes(day) ? p.filter((d) => d !== day) : [...p, day]);
    };

    const handleDailyToggle = () => {
        if (daily) { setDaily(false); setSelectedDays([]); }
        else { setDaily(true); setSelectedDays([...ALL_DAYS]); }
    };

    const handleCreate = async () => {
        if (!selectedItem) return toast.error("Select a menu item");
        if (selectedDays.length === 0) return toast.error("Select at least one day");
        setSaving(true);
        const token = await getIdToken();
        if (!token) { setSaving(false); return; }
        try {
            const res = await fetch("/api/daily-demands", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ itemId: selectedItem, quantity: qty, days: selectedDays }),
            });
            const json = await res.json();
            if (json.success) {
                toast.success(json.action === "updated" ? "Demand updated! ✏️" : "Demand saved! 📋");
                setSelectedItem(""); setQty(1); setSelectedDays([]); setDaily(false);
            } else toast.error(json.error || "Failed");
        } catch { toast.error("Something went wrong"); }
        setSaving(false);
    };

    const handleToggle = async (d: DemandLocal) => {
        // Optimistic UI
        setDemands((prev) => prev.map((item) =>
            item.id === d.id ? { ...item, isActive: !item.isActive } : item
        ));
        const token = await getIdToken();
        if (!token) return;
        try {
            const res = await fetch(`/api/daily-demands?id=${d.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ isActive: !d.isActive }),
            });
            const json = await res.json();
            if (json.success) {
                toast.success(d.isActive ? "Demand paused ⏸️" : "Demand activated ✅");
            } else {
                // Revert on failure
                setDemands((prev) => prev.map((item) =>
                    item.id === d.id ? { ...item, isActive: d.isActive } : item
                ));
                toast.error(json.error || "Failed to toggle");
            }
        } catch {
            setDemands((prev) => prev.map((item) =>
                item.id === d.id ? { ...item, isActive: d.isActive } : item
            ));
            toast.error("Failed to toggle");
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Remove this demand?")) return;
        const token = await getIdToken();
        if (!token) return;
        try {
            const res = await fetch(`/api/daily-demands?id=${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
            const json = await res.json();
            if (json.success) toast.success("Removed 🗑️");
        } catch { toast.error("Failed to delete"); }
    };

    const startEdit = (d: DemandLocal) => { setEditId(d.id); setEditQty(d.quantity); setEditDays([...d.days]); };
    const cancelEdit = () => { setEditId(null); setEditQty(1); setEditDays([]); };

    const saveEdit = async () => {
        if (!editId || editDays.length === 0) return toast.error("Select at least one day");
        setEditSaving(true);
        const token = await getIdToken();
        if (!token) { setEditSaving(false); return; }
        try {
            const res = await fetch(`/api/daily-demands?id=${editId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ quantity: editQty, days: editDays }),
            });
            const json = await res.json();
            if (json.success) { toast.success("Updated ✏️"); cancelEdit(); }
            else toast.error(json.error || "Failed");
        } catch { toast.error("Something went wrong"); }
        setEditSaving(false);
    };

    if (loading) return (
        <div className="min-h-screen bg-zayko-900 flex items-center justify-center">
            <div className="w-12 h-12 border-4 border-gold-400 border-t-transparent rounded-full animate-spin"></div>
        </div>
    );

    return (
        <div className="min-h-screen bg-zayko-900 pb-24">
            {/* Header */}
            <div className="bg-zayko-800/80 backdrop-blur-xl border-b border-white/[0.06] px-4 py-4 sm:px-6 sticky top-0 z-40">
                <div className="max-w-3xl mx-auto flex items-center gap-4">
                    <Link href="/" className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-xs hover:bg-white/10 transition-all">←</Link>
                    <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-xl shadow-lg shadow-blue-500/5">🍱</div>
                    <div>
                        <h1 className="text-lg font-display font-bold text-white uppercase tracking-tight">Daily Needs</h1>
                        <p className="text-[10px] text-zayko-400 font-bold tracking-widest uppercase">Recurring Demand Forecast</p>
                    </div>
                </div>
            </div>

            <div className="max-w-3xl mx-auto p-6 space-y-8">
                {/* ─── Create Form ─── */}
                <div className="bg-zayko-800/50 border border-zayko-700 rounded-2xl p-6 animate-fade-in">
                    <h2 className="text-base font-display font-bold text-white mb-4 flex items-center gap-2">
                        <span className="w-8 h-8 bg-emerald-500/20 rounded-lg flex items-center justify-center text-sm">➕</span>
                        Add Demand
                    </h2>

                    <div className="mb-4">
                        <label className="text-xs text-zayko-400 block mb-1">Menu Item</label>
                        <select value={selectedItem} onChange={(e) => setSelectedItem(e.target.value)}
                            className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-gold-400 appearance-none">
                            <option value="" className="bg-zayko-800">Select an item…</option>
                            {menuItems.map((item) => (
                                <option key={item.id} value={item.id} className="bg-zayko-800">{item.name} — ₹{item.price}</option>
                            ))}
                        </select>
                    </div>

                    <div className="mb-4">
                        <label className="text-xs text-zayko-400 block mb-1">Quantity</label>
                        <input type="number" min={1} max={100} value={qty}
                            onChange={(e) => setQty(Math.max(1, Math.min(100, Number(e.target.value))))}
                            className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-gold-400" />
                    </div>

                    <div className="mb-5">
                        <label className="text-xs text-zayko-400 block mb-2">Days</label>
                        <div className="flex flex-wrap gap-2 mb-2">
                            <button onClick={handleDailyToggle}
                                className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${daily ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/20" : "bg-white/5 text-zayko-400 border border-white/10 hover:bg-white/10"}`}>
                                🔁 Daily
                            </button>
                            {ALL_DAYS.map((day) => (
                                <button key={day} onClick={() => toggleDay(day)}
                                    className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${selectedDays.includes(day) ? "bg-gold-500 text-zayko-900 shadow-lg shadow-gold-500/20" : "bg-white/5 text-zayko-400 border border-white/10 hover:bg-white/10"}`}>
                                    {day}
                                </button>
                            ))}
                        </div>
                    </div>

                    <button onClick={handleCreate} disabled={saving}
                        className="btn-gold w-full py-3 flex items-center justify-center gap-2">
                        {saving ? <div className="w-5 h-5 border-2 border-zayko-900 border-t-transparent rounded-full animate-spin"></div> : <>Save Demand 🚀</>}
                    </button>

                    <p className="text-xs text-zayko-500 mt-3 text-center">
                        If you already have this item, your quantity and days will be updated.
                    </p>
                </div>

                {/* ─── Existing Demands ─── */}
                <div>
                    <h2 className="text-base font-display font-bold text-white mb-4 flex items-center gap-2">
                        <span className="w-8 h-8 bg-purple-500/20 rounded-lg flex items-center justify-center text-sm">📦</span>
                        Your Demands
                    </h2>

                    {fetching ? (
                        <div className="flex items-center justify-center py-12">
                            <div className="w-8 h-8 border-4 border-gold-400 border-t-transparent rounded-full animate-spin"></div>
                        </div>
                    ) : demands.length === 0 ? (
                        <div className="bg-zayko-800/30 border border-zayko-700 rounded-2xl p-8 text-center">
                            <div className="text-4xl mb-3">📭</div>
                            <p className="text-zayko-400">No demands yet. Add one above!</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {demands.map((d) => (
                                <div
                                    key={d.id}
                                    className={`bg-zayko-800/50 border rounded-2xl p-4 transition-all animate-slide-up ${d.isActive ? "border-zayko-700" : "border-zayko-700/50 opacity-60"}`}
                                >
                                    {editId === d.id ? (
                                        <div className="space-y-3">
                                            <div className="flex items-center gap-2">
                                                <span className="text-white font-bold">{d.itemName}</span>
                                                <span className="text-xs text-zayko-500">editing</span>
                                            </div>
                                            <div>
                                                <label className="text-xs text-zayko-400 block mb-1">Quantity</label>
                                                <input type="number" min={1} max={100} value={editQty}
                                                    onChange={(e) => setEditQty(Math.max(1, Math.min(100, Number(e.target.value))))}
                                                    className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/10 text-white text-sm focus:outline-none focus:ring-2 focus:ring-gold-400" />
                                            </div>
                                            <div>
                                                <label className="text-xs text-zayko-400 block mb-1">Days</label>
                                                <div className="flex flex-wrap gap-1.5">
                                                    {ALL_DAYS.map((day) => (
                                                        <button key={day}
                                                            onClick={() => setEditDays((p) => p.includes(day) ? p.filter((x) => x !== day) : [...p, day])}
                                                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${editDays.includes(day) ? "bg-gold-500 text-zayko-900" : "bg-white/5 text-zayko-400 border border-white/10"}`}>
                                                            {day}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                            <div className="flex gap-2 pt-1">
                                                <button onClick={saveEdit} disabled={editSaving}
                                                    className="flex-1 py-2 bg-emerald-500/20 text-emerald-400 rounded-xl text-sm font-bold hover:bg-emerald-500/30 transition-all">
                                                    {editSaving ? "Saving…" : "Save ✓"}
                                                </button>
                                                <button onClick={cancelEdit}
                                                    className="flex-1 py-2 bg-white/5 text-zayko-400 rounded-xl text-sm font-bold hover:bg-white/10 transition-all">
                                                    Cancel
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex items-center justify-between gap-4">
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-2 mb-1 flex-wrap">
                                                    <span className="font-bold text-white truncate">{d.itemName}</span>
                                                    <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 font-semibold">×{d.quantity}</span>
                                                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${d.isActive
                                                        ? "bg-emerald-500/20 text-emerald-400"
                                                        : "bg-zinc-500/20 text-zinc-400"
                                                        }`}>
                                                        {d.isActive ? "Active" : "Paused"}
                                                    </span>
                                                </div>
                                                <div className="flex flex-wrap gap-1 mt-1">
                                                    {d.days.map((day) => (
                                                        <span key={day} className="text-xs bg-white/5 text-zayko-300 px-2 py-0.5 rounded-md">{day}</span>
                                                    ))}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-1.5 shrink-0">
                                                {/* Toggle Switch */}
                                                <button
                                                    onClick={() => handleToggle(d)}
                                                    className={`relative w-11 h-6 rounded-full transition-all ${d.isActive ? "bg-emerald-500" : "bg-zinc-600"}`}
                                                    title={d.isActive ? "Pause demand" : "Activate demand"}
                                                >
                                                    <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${d.isActive ? "left-[22px]" : "left-0.5"}`}></span>
                                                </button>
                                                <button onClick={() => startEdit(d)} className="p-2 rounded-xl text-sm bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-all" title="Edit">✏️</button>
                                                <button onClick={() => handleDelete(d.id)} className="p-2 rounded-xl text-sm bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-all" title="Delete">🗑️</button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Info */}
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-4 flex items-start gap-3">
                    <span className="text-xl">ℹ️</span>
                    <div>
                        <p className="text-blue-300 text-sm font-semibold">For demand forecasting only</p>
                        <p className="text-blue-400/70 text-xs mt-0.5">No orders created. The canteen uses this to plan stock. Toggle OFF to pause without deleting.</p>
                    </div>
                </div>
            </div>
        </div>
    );
}
