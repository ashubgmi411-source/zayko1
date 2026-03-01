"use client";
import React, { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { db } from "@/lib/firebase";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { submitSuggestion, updateSuggestion, deleteSuggestion } from "@/services/itemSuggestionService";
import toast from "react-hot-toast";
import Link from "next/link";

interface SuggestionLocal {
    id: string;
    itemName: string;
    category?: string;
    description?: string;
    expectedPrice?: number;
    totalRequests: number;
    status: "pending" | "approved" | "rejected";
    requestedBy?: string[];
    createdAt: string;
}

const STATUS_STYLE: Record<string, string> = {
    pending: "bg-yellow-500/20 text-yellow-400",
    approved: "bg-emerald-500/20 text-emerald-400",
    rejected: "bg-red-500/20 text-red-400",
};
const STATUS_ICON: Record<string, string> = { pending: "⏳", approved: "✅", rejected: "❌" };

export default function SuggestItemPage() {
    const { user, loading, getIdToken } = useAuth();
    const router = useRouter();

    const [suggestions, setSuggestions] = useState<SuggestionLocal[]>([]);
    const [sugLoading, setSugLoading] = useState(true);

    // Form state
    const [itemName, setItemName] = useState("");
    const [category, setCategory] = useState("");
    const [description, setDescription] = useState("");
    const [expectedPrice, setExpectedPrice] = useState("");
    const [submitting, setSubmitting] = useState(false);

    // Edit state
    const [editId, setEditId] = useState<string | null>(null);
    const [editName, setEditName] = useState("");
    const [editCategory, setEditCategory] = useState("");
    const [editDescription, setEditDescription] = useState("");
    const [editPrice, setEditPrice] = useState("");
    const [editSaving, setEditSaving] = useState(false);

    useEffect(() => {
        if (!loading && !user) router.push("/auth");
    }, [user, loading, router]);

    // Real-time suggestions via onSnapshot
    useEffect(() => {
        if (!user) return;
        setSugLoading(true);
        const q = query(
            collection(db, "itemSuggestions"),
            where("requestedBy", "array-contains", user.uid)
        );
        const unsub = onSnapshot(
            q,
            (snap) => {
                const items = snap.docs.map((d) => ({
                    id: d.id,
                    ...d.data(),
                })) as SuggestionLocal[];
                // Sort by createdAt descending in JS (avoids composite index)
                items.sort((a: any, b: any) => (b.createdAt || "").localeCompare(a.createdAt || ""));
                setSuggestions(items);
                setSugLoading(false);
            },
            (err) => {
                console.error("[Suggestions] onSnapshot error:", err);
                setSugLoading(false);
            }
        );
        return () => unsub();
    }, [user]);

    const handleSubmit = async () => {
        if (!itemName.trim() || itemName.trim().length < 2) {
            return toast.error("Enter an item name (min 2 characters)");
        }

        setSubmitting(true);
        const token = await getIdToken();
        if (!token) { setSubmitting(false); return; }

        try {
            const data: { itemName: string; category?: string; description?: string; expectedPrice?: number } = {
                itemName: itemName.trim(),
            };
            if (category.trim()) data.category = category.trim();
            if (description.trim()) data.description = description.trim();
            if (expectedPrice && Number(expectedPrice) > 0) data.expectedPrice = Number(expectedPrice);

            const res = await submitSuggestion(token, data);

            if (res.success) {
                if (res.action === "created") {
                    toast.success("Suggestion submitted! 💡");
                } else {
                    toast.success("Your vote has been added! 👍");
                }
                setItemName("");
                setCategory("");
                setDescription("");
                setExpectedPrice("");
            } else if (res.alreadyRequested) {
                toast.error("You already suggested this item");
            } else {
                toast.error(res.error || "Failed to submit");
            }
        } catch {
            toast.error("Something went wrong");
        }
        setSubmitting(false);
    };

    const startEdit = (s: SuggestionLocal) => {
        setEditId(s.id);
        setEditName(s.itemName);
        setEditCategory(s.category || "");
        setEditDescription(s.description || "");
        setEditPrice(s.expectedPrice ? String(s.expectedPrice) : "");
    };

    const cancelEdit = () => {
        setEditId(null);
        setEditName("");
        setEditCategory("");
        setEditDescription("");
        setEditPrice("");
    };

    const saveEdit = async () => {
        if (!editId) return;
        if (!editName.trim() || editName.trim().length < 2) return toast.error("Item name min 2 characters");

        setEditSaving(true);
        const token = await getIdToken();
        if (!token) { setEditSaving(false); return; }

        try {
            const res = await updateSuggestion(token, editId, {
                itemName: editName.trim(),
                category: editCategory.trim() || undefined,
                description: editDescription.trim() || undefined,
                expectedPrice: editPrice && Number(editPrice) > 0 ? Number(editPrice) : undefined,
            });
            if (res.success) {
                toast.success("Suggestion updated ✏️");
                cancelEdit();
            } else {
                toast.error(res.error || "Failed to update");
            }
        } catch {
            toast.error("Something went wrong");
        }
        setEditSaving(false);
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Delete this suggestion?")) return;
        const token = await getIdToken();
        if (!token) return;
        try {
            const res = await deleteSuggestion(token, id);
            if (res.success) toast.success("Suggestion deleted 🗑️");
            else toast.error(res.error || "Failed to delete");
        } catch {
            toast.error("Failed to delete");
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-zayko-900 flex items-center justify-center">
                <div className="w-12 h-12 border-4 border-gold-400 border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-zayko-900 pb-24">
            {/* Header */}
            <div className="bg-zayko-800/80 backdrop-blur-xl border-b border-white/[0.06] px-4 py-4 sm:px-6 sticky top-0 z-40">
                <div className="max-w-3xl mx-auto flex items-center gap-4">
                    <Link href="/" className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-xs hover:bg-white/10 transition-all">←</Link>
                    <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-xl shadow-lg shadow-amber-500/5">💡</div>
                    <div>
                        <h1 className="text-lg font-display font-bold text-white uppercase tracking-tight">Suggest Item</h1>
                        <p className="text-[10px] text-zayko-400 font-bold tracking-widest uppercase">Demand Discovery</p>
                    </div>
                </div>
            </div>

            <div className="max-w-3xl mx-auto p-6 space-y-8">
                {/* ─── Submission Form ─── */}
                <div className="bg-zayko-800/50 border border-zayko-700 rounded-2xl p-6 animate-fade-in">
                    <h2 className="text-base font-display font-bold text-white mb-4 flex items-center gap-2">
                        <span className="w-8 h-8 bg-emerald-500/20 rounded-lg flex items-center justify-center text-sm">✨</span>
                        Submit Suggestion
                    </h2>

                    <div className="space-y-4">
                        {/* Item Name */}
                        <div>
                            <label className="text-xs text-zayko-400 block mb-1">Item Name *</label>
                            <input
                                type="text"
                                value={itemName}
                                onChange={(e) => setItemName(e.target.value)}
                                placeholder="e.g. Masala Dosa, Cold Coffee…"
                                className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/10 text-white placeholder:text-zayko-500 focus:outline-none focus:ring-2 focus:ring-gold-400"
                            />
                        </div>

                        {/* Category & Price row */}
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-xs text-zayko-400 block mb-1">Category (optional)</label>
                                <input
                                    type="text"
                                    value={category}
                                    onChange={(e) => setCategory(e.target.value)}
                                    placeholder="e.g. Snacks, Beverages…"
                                    className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/10 text-white placeholder:text-zayko-500 focus:outline-none focus:ring-2 focus:ring-gold-400"
                                />
                            </div>
                            <div>
                                <label className="text-xs text-zayko-400 block mb-1">Expected Price (optional)</label>
                                <input
                                    type="number"
                                    value={expectedPrice}
                                    onChange={(e) => setExpectedPrice(e.target.value)}
                                    placeholder="₹"
                                    min={0}
                                    className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/10 text-white placeholder:text-zayko-500 focus:outline-none focus:ring-2 focus:ring-gold-400"
                                />
                            </div>
                        </div>

                        {/* Description */}
                        <div>
                            <label className="text-xs text-zayko-400 block mb-1">Description (optional)</label>
                            <textarea
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                placeholder="Any details about the item…"
                                rows={2}
                                className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/10 text-white placeholder:text-zayko-500 focus:outline-none focus:ring-2 focus:ring-gold-400 resize-none"
                            />
                        </div>

                        <button
                            onClick={handleSubmit}
                            disabled={submitting}
                            className="btn-gold w-full py-3 flex items-center justify-center gap-2"
                        >
                            {submitting ? (
                                <div className="w-5 h-5 border-2 border-zayko-900 border-t-transparent rounded-full animate-spin"></div>
                            ) : (
                                <>Submit Suggestion 🚀</>
                            )}
                        </button>
                    </div>

                    {/* Info */}
                    <p className="text-xs text-zayko-500 mt-3 text-center">
                        If someone already suggested this item, your vote will be added instead.
                    </p>
                </div>

                {/* ─── My Suggestions ─── */}
                <div>
                    <h2 className="text-base font-display font-bold text-white mb-4 flex items-center gap-2">
                        <span className="w-8 h-8 bg-purple-500/20 rounded-lg flex items-center justify-center text-sm">📋</span>
                        My Suggestions
                    </h2>

                    {sugLoading ? (
                        <div className="flex items-center justify-center py-12">
                            <div className="w-8 h-8 border-4 border-gold-400 border-t-transparent rounded-full animate-spin"></div>
                        </div>
                    ) : suggestions.length === 0 ? (
                        <div className="bg-zayko-800/30 border border-zayko-700 rounded-2xl p-8 text-center">
                            <div className="text-4xl mb-3">📭</div>
                            <p className="text-zayko-400">No suggestions yet. Suggest an item above!</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {suggestions.map((s) => (
                                <div key={s.id} className="bg-zayko-800/50 border border-zayko-700 rounded-2xl p-4 animate-slide-up">
                                    {editId === s.id ? (
                                        /* Edit Mode */
                                        <div className="space-y-3">
                                            <div>
                                                <label className="text-xs text-zayko-400 block mb-1">Item Name</label>
                                                <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)}
                                                    className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/10 text-white text-sm focus:outline-none focus:ring-2 focus:ring-gold-400" />
                                            </div>
                                            <div className="grid grid-cols-2 gap-2">
                                                <div>
                                                    <label className="text-xs text-zayko-400 block mb-1">Category</label>
                                                    <input type="text" value={editCategory} onChange={(e) => setEditCategory(e.target.value)}
                                                        className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/10 text-white text-sm focus:outline-none focus:ring-2 focus:ring-gold-400" />
                                                </div>
                                                <div>
                                                    <label className="text-xs text-zayko-400 block mb-1">Price</label>
                                                    <input type="number" value={editPrice} onChange={(e) => setEditPrice(e.target.value)} min={0}
                                                        className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/10 text-white text-sm focus:outline-none focus:ring-2 focus:ring-gold-400" />
                                                </div>
                                            </div>
                                            <div>
                                                <label className="text-xs text-zayko-400 block mb-1">Description</label>
                                                <textarea value={editDescription} onChange={(e) => setEditDescription(e.target.value)} rows={2}
                                                    className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/10 text-white text-sm focus:outline-none focus:ring-2 focus:ring-gold-400 resize-none" />
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
                                        /* View Mode */
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-2 mb-1 flex-wrap">
                                                    <span className="font-bold text-white">{s.itemName}</span>
                                                    {s.category && (
                                                        <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400">
                                                            {s.category}
                                                        </span>
                                                    )}
                                                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${STATUS_STYLE[s.status]}`}>
                                                        {STATUS_ICON[s.status]} {s.status.charAt(0).toUpperCase() + s.status.slice(1)}
                                                    </span>
                                                </div>
                                                {s.description && (
                                                    <p className="text-xs text-zayko-400 mt-0.5 line-clamp-1">{s.description}</p>
                                                )}
                                                <div className="flex items-center gap-3 mt-1.5 text-xs text-zayko-500">
                                                    <span>👥 {s.totalRequests} request{s.totalRequests !== 1 ? "s" : ""}</span>
                                                    {s.expectedPrice && <span>💰 ₹{s.expectedPrice}</span>}
                                                </div>
                                            </div>
                                            {/* Edit/Delete buttons — only for pending suggestions */}
                                            {s.status === "pending" && (
                                                <div className="flex items-center gap-1.5 shrink-0">
                                                    <button onClick={() => startEdit(s)} className="p-2 rounded-xl text-sm bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-all" title="Edit">✏️</button>
                                                    <button onClick={() => handleDelete(s.id)} className="p-2 rounded-xl text-sm bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-all" title="Delete">🗑️</button>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
