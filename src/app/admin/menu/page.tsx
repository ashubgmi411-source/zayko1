"use client";

import React, { useEffect, useState, useMemo, useCallback } from "react";
import AdminGuard from "@/components/AdminGuard";
import Link from "next/link";
import { db } from "@/lib/firebase";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import toast from "react-hot-toast";
import MenuImageUpload from "@/components/admin/MenuImageUpload";
import MenuImageUploader from "@/components/admin/MenuImageUploader";
import ParsedItemsPreview from "@/components/admin/ParsedItemsPreview";
import MenuFilters, {
    type AvailabilityFilter,
} from "@/components/admin/MenuFilters";

import { MenuItem, MenuItemCustomization, MenuItemOption, CategoryDoc } from "@/types";

interface ParsedMenuItem {
    name: string;
    price: number;
    category: string;
}

// ─── Component ──────────────────────────────────

export default function AdminMenuPage() {
    // Core state
    const [items, setItems] = useState<MenuItem[]>([]);
    const [loading, setLoading] = useState(true);

    // Dynamic categories
    const [categories, setCategories] = useState<CategoryDoc[]>([]);
    const [showCatManager, setShowCatManager] = useState(false);
    const [newCatName, setNewCatName] = useState("");
    const [catSaving, setCatSaving] = useState(false);
    const [editingCatId, setEditingCatId] = useState<string | null>(null);
    const [editingCatName, setEditingCatName] = useState("");

    // Add/Edit form state
    const [showForm, setShowForm] = useState(false);
    const [editItem, setEditItem] = useState<MenuItem | null>(null);
    const [form, setForm] = useState({
        name: "",
        price: "",
        category: "",
        quantity: "",
        description: "",
        available: true,
        preparationTime: "",
        customizations: [] as MenuItemCustomization[],
    });
    const [saving, setSaving] = useState(false);

    // AI Upload state
    const [showAiUpload, setShowAiUpload] = useState(false);
    const [parsedItems, setParsedItems] = useState<ParsedMenuItem[] | null>(null);

    // Filter state
    const [categoryFilter, setCategoryFilter] = useState<string>("all");
    const [availabilityFilter, setAvailabilityFilter] = useState<AvailabilityFilter>("all");
    const [searchQuery, setSearchQuery] = useState<string>("");

    // Inline quantity editing state
    const [editingQuantity, setEditingQuantity] = useState<string | null>(null);
    const [tempQuantity, setTempQuantity] = useState("");

    // ─── Real-time Firestore subscriptions ─────────

    useEffect(() => {
        const q = query(collection(db, "menuItems"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const menuList = snapshot.docs.map((doc) => ({
                id: doc.id,
                ...doc.data(),
            })) as MenuItem[];
            setItems(menuList);
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);

    // Categories real-time subscription
    useEffect(() => {
        const q = query(collection(db, "categories"), orderBy("order", "asc"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const catList = snapshot.docs.map((doc) => ({
                id: doc.id,
                ...doc.data(),
            })) as CategoryDoc[];
            setCategories(catList);
        });
        return () => unsubscribe();
    }, []);

    // Derived: category slugs for dropdowns
    const categorySlugs = useMemo(() => categories.map((c) => c.slug), [categories]);
    const categoryOptions = useMemo(
        () => categories.map((c) => ({ value: c.slug, label: c.name })),
        [categories]
    );

    // ─── Filtered items (client-side) ─────────────

    const filteredItems = useMemo(() => {
        const needle = searchQuery.trim().toLowerCase();
        return items.filter((item) => {
            // Search filter — case-insensitive name match
            if (needle && !item.name.toLowerCase().includes(needle)) {
                return false;
            }

            // Category filter
            if (categoryFilter !== "all" && item.category !== categoryFilter) {
                return false;
            }

            // Availability filter
            // "unavailable" means: available === false OR quantity === 0
            if (availabilityFilter === "available") {
                if (!item.available || item.quantity === 0) return false;
            } else if (availabilityFilter === "unavailable") {
                if (item.available && item.quantity > 0) return false;
            }

            return true;
        });
    }, [items, searchQuery, categoryFilter, availabilityFilter]);

    // ─── Auth header helper ───────────────────────

    const getAdminHeaders = useCallback((contentType = true): HeadersInit => {
        const token = localStorage.getItem("adminToken");
        const headers: Record<string, string> = {
            Authorization: `Bearer ${token}`,
        };
        if (contentType) headers["Content-Type"] = "application/json";
        return headers;
    }, []);

    // ─── Form handlers ───────────────────────────

    const resetForm = () => {
        setForm({
            name: "",
            price: "",
            category: categorySlugs[0] || "",
            quantity: "",
            description: "",
            available: true,
            preparationTime: "",
            customizations: [],
        });
        setEditItem(null);
        setShowForm(false);
    };

    const openEdit = (item: MenuItem) => {
        setEditItem(item);
        setForm({
            name: item.name,
            price: String(item.price),
            category: item.category,
            quantity: String(item.quantity),
            description: item.description || "",
            available: item.available,
            preparationTime: item.preparationTime
                ? String(item.preparationTime)
                : "",
            customizations: item.customizations || [],
        });
        setShowForm(true);
    };

    const handleSubmit = async () => {
        if (!form.name || !form.price || !form.quantity) {
            toast.error("Name, price, and quantity are required");
            return;
        }

        setSaving(true);
        try {
            if (editItem) {
                await fetch("/api/admin/menu", {
                    method: "PUT",
                    headers: getAdminHeaders(),
                    body: JSON.stringify({
                        id: editItem.id,
                        name: form.name,
                        price: Number(form.price),
                        category: form.category,
                        quantity: Number(form.quantity),
                        customizations: form.customizations,
                        preparationTime: form.preparationTime
                            ? Number(form.preparationTime)
                            : 0,
                    }),
                });
                toast.success("Item updated! ✅");
            } else {
                await fetch("/api/admin/menu", {
                    method: "POST",
                    headers: getAdminHeaders(),
                    body: JSON.stringify({
                        name: form.name,
                        price: Number(form.price),
                        category: form.category,
                        quantity: Number(form.quantity),
                        description: form.description,
                        available: form.available,
                        customizations: form.customizations,
                        preparationTime: form.preparationTime
                            ? Number(form.preparationTime)
                            : 0,
                    }),
                });
                toast.success("Item added! 🎉");
            }
            resetForm();
        } catch {
            toast.error("Failed to save item");
        }
        setSaving(false);
    };

    const deleteItem = async (id: string) => {
        if (!confirm("Delete this item?")) return;
        try {
            await fetch("/api/admin/menu", {
                method: "DELETE",
                headers: getAdminHeaders(),
                body: JSON.stringify({ id }),
            });
            toast.success("Item deleted");
        } catch {
            toast.error("Failed to delete");
        }
    };

    const toggleAvailability = async (item: MenuItem) => {
        try {
            await fetch("/api/admin/menu", {
                method: "PUT",
                headers: getAdminHeaders(),
                body: JSON.stringify({ id: item.id, available: !item.available }),
            });
            toast.success(
                `${item.name} marked as ${!item.available ? "available" : "unavailable"}`
            );
        } catch {
            toast.error("Failed to update");
        }
    };

    // ─── Inline quantity editing ──────────────────

    const startQuantityEdit = (item: MenuItem) => {
        setEditingQuantity(item.id);
        setTempQuantity(String(item.quantity));
    };

    /**
     * Saves the updated quantity to Firestore.
     * If quantity becomes 0, automatically sets available = false.
     * If quantity goes from 0 to a positive number, automatically sets available = true.
     */
    const saveQuantity = async (item: MenuItem) => {
        const newQuantity = Math.max(0, parseInt(tempQuantity, 10) || 0);
        setEditingQuantity(null);

        // Don't update if nothing changed
        if (newQuantity === item.quantity) return;

        try {
            // Determine if availability needs to change
            const updateData: Record<string, unknown> = {
                id: item.id,
                quantity: newQuantity,
            };

            // Auto-toggle availability based on quantity
            if (newQuantity === 0 && item.available) {
                updateData.available = false;
                toast("Quantity is 0 — item marked unavailable", { icon: "⚠️" });
            } else if (newQuantity > 0 && !item.available) {
                updateData.available = true;
                toast("Stock restored — item marked available", { icon: "✅" });
            }

            await fetch("/api/admin/menu", {
                method: "PUT",
                headers: getAdminHeaders(),
                body: JSON.stringify(updateData),
            });
        } catch {
            toast.error("Failed to update quantity");
        }
    };

    const handleQuantityKeyDown = (
        e: React.KeyboardEvent,
        item: MenuItem
    ) => {
        if (e.key === "Enter") saveQuantity(item);
        if (e.key === "Escape") setEditingQuantity(null);
    };

    // ─── Customization Helpers ───────────────────

    const addCustomization = () => {
        const newCust: MenuItemCustomization = {
            id: Math.random().toString(36).substr(2, 9),
            title: "",
            type: "single",
            required: false,
            options: [],
        };
        setForm({ ...form, customizations: [...form.customizations, newCust] });
    };

    const removeCustomization = (index: number) => {
        const updated = [...form.customizations];
        updated.splice(index, 1);
        setForm({ ...form, customizations: updated });
    };

    const updateCustomization = (index: number, data: Partial<MenuItemCustomization>) => {
        const updated = [...form.customizations];
        updated[index] = { ...updated[index], ...data };
        setForm({ ...form, customizations: updated });
    };

    const addOption = (custIndex: number) => {
        const newOption: MenuItemOption = {
            id: Math.random().toString(36).substr(2, 9),
            name: "",
            price: 0,
        };
        const updated = [...form.customizations];
        updated[custIndex].options.push(newOption);
        setForm({ ...form, customizations: updated });
    };

    const removeOption = (custIndex: number, optIndex: number) => {
        const updated = [...form.customizations];
        updated[custIndex].options.splice(optIndex, 1);
        setForm({ ...form, customizations: updated });
    };

    const updateOption = (custIndex: number, optIndex: number, data: Partial<MenuItemOption>) => {
        const updated = [...form.customizations];
        updated[custIndex].options[optIndex] = { ...updated[custIndex].options[optIndex], ...data };
        setForm({ ...form, customizations: updated });
    };

    // ─── AI Upload handlers ───────────────────────

    const handleItemsParsed = (items: ParsedMenuItem[]) => {
        setShowAiUpload(false);
        setParsedItems(items);
    };

    const handlePreviewClose = () => {
        setParsedItems(null);
    };

    // ─── Render ───────────────────────────────────

    return (
        <AdminGuard>
            <div className="min-h-screen bg-zayko-900">
                {/* Header */}
                <div className="bg-zayko-800 border-b border-zayko-700 px-6 py-4">
                    <div className="max-w-7xl mx-auto flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <Link
                                href="/admin/dashboard"
                                className="text-zayko-400 hover:text-white transition-colors"
                            >
                                ← Dashboard
                            </Link>
                            <h1 className="text-lg font-display font-bold text-white">
                                🍽️ Menu Management
                            </h1>
                        </div>
                        <div className="flex items-center gap-2">
                            {/* Category Manager Button */}
                            <button
                                onClick={() => setShowCatManager(true)}
                                className="px-4 py-2 bg-teal-500/20 text-teal-300 border border-teal-500/30 rounded-xl text-sm font-medium hover:bg-teal-500/30 transition-all flex items-center gap-2"
                            >
                                📂 Categories
                            </button>
                            {/* AI Upload Button */}
                            <button
                                onClick={() => setShowAiUpload(true)}
                                className="px-4 py-2 bg-purple-500/20 text-purple-300 border border-purple-500/30 rounded-xl text-sm font-medium hover:bg-purple-500/30 transition-all flex items-center gap-2"
                            >
                                🤖 AI Upload
                            </button>
                            {/* Manual Add Button */}
                            <button
                                onClick={() => {
                                    resetForm();
                                    setShowForm(true);
                                }}
                                className="btn-gold text-sm py-2"
                            >
                                + Add Item
                            </button>
                        </div>
                    </div>
                </div>

                <div className="max-w-7xl mx-auto p-6">
                    {/* ── Filters ── */}
                    <MenuFilters
                        categoryFilter={categoryFilter}
                        availabilityFilter={availabilityFilter}
                        searchQuery={searchQuery}
                        onCategoryChange={setCategoryFilter}
                        onAvailabilityChange={setAvailabilityFilter}
                        onSearchChange={setSearchQuery}
                        totalCount={items.length}
                        filteredCount={filteredItems.length}
                        dynamicCategories={categoryOptions}
                    />

                    {/* ── AI Upload Modal ── */}
                    {showAiUpload && (
                        <MenuImageUpload
                            onItemsParsed={handleItemsParsed}
                            onClose={() => setShowAiUpload(false)}
                        />
                    )}

                    {/* ── Parsed Items Preview Modal ── */}
                    {parsedItems && (
                        <ParsedItemsPreview
                            items={parsedItems}
                            onClose={handlePreviewClose}
                        />
                    )}

                    {/* ── Add/Edit Modal ── */}
                    {showForm && (
                        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                            <div className="bg-zayko-800 border border-zayko-700 rounded-2xl p-6 w-full max-w-md animate-scale-in">
                                <h3 className="text-lg font-display font-bold text-white mb-4">
                                    {editItem ? "✏️ Edit Item" : "➕ Add New Item"}
                                </h3>

                                <div className="space-y-3">
                                    <input
                                        type="text"
                                        value={form.name}
                                        onChange={(e) =>
                                            setForm({ ...form, name: e.target.value })
                                        }
                                        placeholder="Item name"
                                        className="w-full px-4 py-3 rounded-xl bg-zayko-700 border border-zayko-600 text-white placeholder:text-zayko-500 focus:ring-2 focus:ring-gold-400 focus:outline-none"
                                    />
                                    <div className="grid grid-cols-2 gap-3">
                                        <input
                                            type="number"
                                            value={form.price}
                                            onChange={(e) =>
                                                setForm({ ...form, price: e.target.value })
                                            }
                                            placeholder="Price (₹)"
                                            className="w-full px-4 py-3 rounded-xl bg-zayko-700 border border-zayko-600 text-white placeholder:text-zayko-500 focus:ring-2 focus:ring-gold-400 focus:outline-none"
                                        />
                                        <input
                                            type="number"
                                            value={form.quantity}
                                            onChange={(e) =>
                                                setForm({ ...form, quantity: e.target.value })
                                            }
                                            placeholder="Quantity"
                                            className="w-full px-4 py-3 rounded-xl bg-zayko-700 border border-zayko-600 text-white placeholder:text-zayko-500 focus:ring-2 focus:ring-gold-400 focus:outline-none"
                                        />
                                    </div>
                                    <input
                                        type="number"
                                        value={form.preparationTime}
                                        onChange={(e) =>
                                            setForm({ ...form, preparationTime: e.target.value })
                                        }
                                        placeholder="Preparation time (minutes)"
                                        min={0}
                                        className="w-full px-4 py-3 rounded-xl bg-zayko-700 border border-zayko-600 text-white placeholder:text-zayko-500 focus:ring-2 focus:ring-gold-400 focus:outline-none"
                                    />
                                    <select
                                        value={form.category}
                                        onChange={(e) =>
                                            setForm({ ...form, category: e.target.value })
                                        }
                                        className="w-full px-4 py-3 rounded-xl bg-zayko-700 border border-zayko-600 text-white focus:ring-2 focus:ring-gold-400 focus:outline-none"
                                    >
                                        {categories.length === 0 && (
                                            <option value="" disabled>No categories — add one first</option>
                                        )}
                                        {categories.map((c) => (
                                            <option key={c.id} value={c.slug}>
                                                {c.name}
                                            </option>
                                        ))}
                                    </select>
                                    <textarea
                                        value={form.description}
                                        onChange={(e) =>
                                            setForm({ ...form, description: e.target.value })
                                        }
                                        placeholder="Description (optional)"
                                        rows={2}
                                        className="w-full px-4 py-3 rounded-xl bg-zayko-700 border border-zayko-600 text-white placeholder:text-zayko-500 focus:ring-2 focus:ring-gold-400 focus:outline-none resize-none"
                                    />

                                    {/* Image Upload (only when editing an existing item) */}
                                    {editItem && (
                                        <MenuImageUploader
                                            menuItemId={editItem.id}
                                            currentImage={editItem.image}
                                            onUploadComplete={(url) => {
                                                // Image is already saved to Firestore by the API
                                                toast.success(`Image updated for ${editItem.name}`);
                                            }}
                                        />
                                    )}

                                    {/* Customizations Section */}
                                    <div className="space-y-3 pt-2">
                                        <div className="flex items-center justify-between">
                                            <h4 className="text-sm font-bold text-zayko-300 uppercase tracking-wider">Customizations</h4>
                                            <button
                                                type="button"
                                                onClick={addCustomization}
                                                className="text-xs bg-gold-400/10 text-gold-400 px-2 py-1 rounded-lg hover:bg-gold-400/20 transition-all"
                                            >
                                                + Add Section
                                            </button>
                                        </div>

                                        {form.customizations.map((cust, cIdx) => (
                                            <div key={cust.id} className="p-3 bg-zayko-900/50 border border-zayko-600 rounded-xl space-y-3">
                                                <div className="flex gap-2">
                                                    <input
                                                        type="text"
                                                        value={cust.title}
                                                        onChange={(e) => updateCustomization(cIdx, { title: e.target.value })}
                                                        placeholder="e.g. Extra Toppings"
                                                        className="flex-1 bg-zayko-800 border-none rounded-lg px-3 py-2 text-xs text-white placeholder:text-zayko-500 focus:ring-1 focus:ring-gold-400"
                                                    />
                                                    <select
                                                        value={cust.type}
                                                        onChange={(e) => updateCustomization(cIdx, { type: e.target.value as "single" | "multiple" })}
                                                        className="bg-zayko-800 border-none rounded-lg px-2 py-2 text-[10px] text-zayko-300 focus:ring-1 focus:ring-gold-400"
                                                    >
                                                        <option value="single">Single</option>
                                                        <option value="multiple">Multiple</option>
                                                    </select>
                                                    <button
                                                        type="button"
                                                        onClick={() => removeCustomization(cIdx)}
                                                        className="text-red-400 p-2 hover:bg-red-500/10 rounded-lg"
                                                    >
                                                        ✕
                                                    </button>
                                                </div>

                                                <label className="flex items-center gap-2 text-[10px] text-zayko-400">
                                                    <input
                                                        type="checkbox"
                                                        checked={cust.required}
                                                        onChange={(e) => updateCustomization(cIdx, { required: e.target.checked })}
                                                        className="accent-gold-500"
                                                    />
                                                    Required
                                                </label>

                                                <div className="space-y-2 pl-2 border-l border-zayko-700">
                                                    {cust.options.map((opt, oIdx) => (
                                                        <div key={opt.id} className="flex gap-2 items-center">
                                                            <input
                                                                type="text"
                                                                value={opt.name}
                                                                onChange={(e) => updateOption(cIdx, oIdx, { name: e.target.value })}
                                                                placeholder="Option name"
                                                                className="flex-1 bg-zayko-800 border-none rounded-lg px-2 py-1.5 text-[10px] text-white placeholder:text-zayko-600 focus:ring-1 focus:ring-gold-400"
                                                            />
                                                            <input
                                                                type="number"
                                                                value={opt.price}
                                                                onChange={(e) => updateOption(cIdx, oIdx, { price: Number(e.target.value) })}
                                                                placeholder="₹"
                                                                className="w-14 bg-zayko-800 border-none rounded-lg px-2 py-1.5 text-[10px] text-gold-400 placeholder:text-zayko-600 focus:ring-1 focus:ring-gold-400"
                                                            />
                                                            <button
                                                                type="button"
                                                                onClick={() => removeOption(cIdx, oIdx)}
                                                                className="text-zayko-500 hover:text-red-400"
                                                            >
                                                                ✕
                                                            </button>
                                                        </div>
                                                    ))}
                                                    <button
                                                        type="button"
                                                        onClick={() => addOption(cIdx)}
                                                        className="text-[10px] text-zayko-400 hover:text-gold-400 p-1 transition-colors"
                                                    >
                                                        + Add Option
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    <label className="flex items-center gap-2 text-zayko-300 text-sm cursor-pointer border-t border-zayko-700 pt-3">
                                        <input
                                            type="checkbox"
                                            checked={form.available}
                                            onChange={(e) =>
                                                setForm({ ...form, available: e.target.checked })
                                            }
                                            className="w-4 h-4 rounded accent-gold-500"
                                        />
                                        Available for ordering
                                    </label>
                                </div>

                                <div className="flex gap-3 mt-6">
                                    <button
                                        onClick={resetForm}
                                        className="flex-1 px-4 py-3 bg-zayko-700 text-zayko-300 rounded-xl hover:bg-zayko-600 transition-all"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleSubmit}
                                        disabled={saving}
                                        className="flex-1 btn-gold py-3"
                                    >
                                        {saving
                                            ? "Saving..."
                                            : editItem
                                                ? "Update"
                                                : "Add Item"}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ── Menu Items Table ── */}
                    {loading ? (
                        <div className="flex items-center justify-center py-20">
                            <div className="w-12 h-12 border-4 border-gold-400 border-t-transparent rounded-full animate-spin" />
                        </div>
                    ) : filteredItems.length === 0 ? (
                        <div className="text-center py-20 text-zayko-500">
                            <div className="text-5xl mb-4">
                                {items.length === 0 ? "🍽️" : "🔍"}
                            </div>
                            <p>
                                {items.length === 0
                                    ? "No menu items yet. Add your first item!"
                                    : "No items match your current filters."}
                            </p>
                            {items.length > 0 && (
                                <button
                                    onClick={() => {
                                        setSearchQuery("");
                                        setCategoryFilter("all");
                                        setAvailabilityFilter("all");
                                    }}
                                    className="mt-3 text-gold-400 hover:text-gold-300 text-sm font-medium"
                                >
                                    Clear all filters
                                </button>
                            )}
                        </div>
                    ) : (
                        <div className="space-y-3 animate-fade-in">
                            {/* Desktop Table Header */}
                            <div className="hidden lg:grid grid-cols-12 gap-4 px-5 py-3 text-xs font-semibold text-zayko-500 uppercase">
                                <div className="col-span-3">Item</div>
                                <div className="col-span-2">Category</div>
                                <div className="col-span-1">Price</div>
                                <div className="col-span-1">Qty</div>
                                <div className="col-span-1">Prep</div>
                                <div className="col-span-1">Status</div>
                                <div className="col-span-3 text-right">Actions</div>
                            </div>

                            {filteredItems.map((item) => (
                                <div
                                    key={item.id}
                                    className="bg-zayko-800/50 border border-zayko-700 rounded-xl p-4 lg:p-5 lg:grid lg:grid-cols-12 lg:gap-4 lg:items-center"
                                >
                                    {/* Name & Description */}
                                    <div className="col-span-3 mb-2 lg:mb-0">
                                        <h4 className="font-semibold text-white">
                                            {item.name}
                                        </h4>
                                        {item.description && (
                                            <p className="text-xs text-zayko-500 truncate">
                                                {item.description}
                                            </p>
                                        )}
                                    </div>

                                    {/* Category */}
                                    <div className="col-span-2 mb-2 lg:mb-0">
                                        <span className="px-3 py-1 bg-zayko-700 text-zayko-300 text-xs rounded-full capitalize">
                                            {item.category}
                                        </span>
                                    </div>

                                    {/* Price */}
                                    <div className="col-span-1 text-gold-400 font-bold mb-2 lg:mb-0">
                                        ₹{item.price}
                                    </div>

                                    {/* Quantity — Inline Editable */}
                                    <div className="col-span-1 mb-2 lg:mb-0">
                                        {editingQuantity === item.id ? (
                                            <input
                                                type="number"
                                                value={tempQuantity}
                                                onChange={(e) => setTempQuantity(e.target.value)}
                                                onBlur={() => saveQuantity(item)}
                                                onKeyDown={(e) => handleQuantityKeyDown(e, item)}
                                                min={0}
                                                autoFocus
                                                className="w-16 px-2 py-1 rounded-lg bg-zayko-700 border border-gold-400 text-white text-sm focus:outline-none"
                                            />
                                        ) : (
                                            <button
                                                onClick={() => startQuantityEdit(item)}
                                                className={`px-2 py-1 rounded-lg text-sm font-medium transition-all hover:bg-zayko-700 ${item.quantity === 0
                                                    ? "text-red-400"
                                                    : "text-zayko-300"
                                                    }`}
                                                title="Click to edit quantity"
                                            >
                                                {item.quantity}
                                                <span className="ml-1 text-zayko-600 text-xs">
                                                    ✎
                                                </span>
                                            </button>
                                        )}
                                    </div>

                                    {/* Prep Time */}
                                    <div className="col-span-1 text-zayko-300 text-sm mb-2 lg:mb-0">
                                        {item.preparationTime
                                            ? `${item.preparationTime}m`
                                            : "—"}
                                    </div>

                                    {/* Availability Status */}
                                    <div className="col-span-1 mb-3 lg:mb-0">
                                        <button
                                            onClick={() => toggleAvailability(item)}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${item.available && item.quantity > 0
                                                ? "bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30"
                                                : "bg-red-500/20 text-red-400 hover:bg-red-500/30"
                                                }`}
                                        >
                                            {item.available && item.quantity > 0
                                                ? "✓ Available"
                                                : "✗ Unavailable"}
                                        </button>
                                    </div>

                                    {/* Actions */}
                                    <div className="col-span-3 flex gap-2 justify-end">
                                        <button
                                            onClick={() => openEdit(item)}
                                            className="px-3 py-1.5 bg-blue-500/20 text-blue-400 rounded-lg text-xs font-medium hover:bg-blue-500/30 transition-all"
                                        >
                                            ✏️ Edit
                                        </button>
                                        <button
                                            onClick={() => deleteItem(item.id)}
                                            className="px-3 py-1.5 bg-red-500/20 text-red-400 rounded-lg text-xs font-medium hover:bg-red-500/30 transition-all"
                                        >
                                            🗑️ Delete
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* ══ Category Manager Modal ══ */}
                {showCatManager && (
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                        <div className="bg-zayko-800 border border-zayko-700 rounded-2xl p-6 w-full max-w-md animate-scale-in max-h-[80vh] flex flex-col">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-lg font-display font-bold text-white">📂 Categories</h3>
                                <button
                                    onClick={() => setShowCatManager(false)}
                                    className="text-zayko-400 hover:text-white transition-colors text-xl"
                                >
                                    ✕
                                </button>
                            </div>

                            {/* Add Category */}
                            <div className="flex gap-2 mb-4">
                                <input
                                    type="text"
                                    value={newCatName}
                                    onChange={(e) => setNewCatName(e.target.value)}
                                    placeholder="New category name"
                                    className="flex-1 px-3 py-2 rounded-lg bg-zayko-700 border border-zayko-600 text-white text-sm placeholder:text-zayko-500 focus:ring-2 focus:ring-gold-400 focus:outline-none"
                                    onKeyDown={(e) => e.key === "Enter" && !catSaving && addCategory()}
                                />
                                <button
                                    onClick={addCategory}
                                    disabled={catSaving || !newCatName.trim()}
                                    className="px-4 py-2 btn-gold text-sm disabled:opacity-50"
                                >
                                    {catSaving ? "..." : "+ Add"}
                                </button>
                            </div>

                            {/* Category List */}
                            <div className="flex-1 overflow-y-auto space-y-2">
                                {categories.length === 0 ? (
                                    <div className="text-center py-8 text-zayko-500">
                                        <div className="text-3xl mb-2">📂</div>
                                        <p className="text-sm">No categories yet</p>
                                    </div>
                                ) : (
                                    categories.map((cat) => (
                                        <div
                                            key={cat.id}
                                            className="flex items-center gap-2 bg-zayko-700/50 border border-zayko-600 rounded-xl px-3 py-2.5"
                                        >
                                            {editingCatId === cat.id ? (
                                                <>
                                                    <input
                                                        type="text"
                                                        value={editingCatName}
                                                        onChange={(e) => setEditingCatName(e.target.value)}
                                                        className="flex-1 px-2 py-1 rounded-lg bg-zayko-800 border border-gold-400 text-white text-sm focus:outline-none"
                                                        autoFocus
                                                        onKeyDown={(e) => {
                                                            if (e.key === "Enter") renameCategory(cat.id);
                                                            if (e.key === "Escape") setEditingCatId(null);
                                                        }}
                                                    />
                                                    <button
                                                        onClick={() => renameCategory(cat.id)}
                                                        className="text-emerald-400 text-xs font-medium hover:text-emerald-300"
                                                    >
                                                        ✓ Save
                                                    </button>
                                                    <button
                                                        onClick={() => setEditingCatId(null)}
                                                        className="text-zayko-400 text-xs hover:text-white"
                                                    >
                                                        ✕
                                                    </button>
                                                </>
                                            ) : (
                                                <>
                                                    <span className="flex-1 text-white text-sm font-medium">{cat.name}</span>
                                                    <span className="text-zayko-500 text-xs">
                                                        {items.filter((i) => i.category === cat.slug).length} items
                                                    </span>
                                                    <button
                                                        onClick={() => {
                                                            setEditingCatId(cat.id);
                                                            setEditingCatName(cat.name);
                                                        }}
                                                        className="text-blue-400 text-xs hover:text-blue-300"
                                                    >
                                                        ✏️
                                                    </button>
                                                    <button
                                                        onClick={() => deleteCategory(cat.id, cat.name)}
                                                        className="text-red-400 text-xs hover:text-red-300"
                                                    >
                                                        🗑️
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </AdminGuard>
    );

    // ─── Category CRUD helpers ───────────────────

    async function addCategory() {
        if (!newCatName.trim()) return;
        setCatSaving(true);
        try {
            const token = localStorage.getItem("adminToken");
            const res = await fetch("/api/admin/categories", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ name: newCatName.trim() }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            toast.success(`Category "${newCatName.trim()}" created! 🎉`);
            setNewCatName("");
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : "Failed to create category");
        }
        setCatSaving(false);
    }

    async function renameCategory(id: string) {
        if (!editingCatName.trim()) return;
        try {
            const token = localStorage.getItem("adminToken");
            const res = await fetch("/api/admin/categories", {
                method: "PUT",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ id, name: editingCatName.trim() }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            toast.success("Category renamed! ✅");
            setEditingCatId(null);
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : "Failed to rename");
        }
    }

    async function deleteCategory(id: string, name: string) {
        if (!confirm(`Delete category "${name}"? Items must be moved first.`)) return;
        try {
            const token = localStorage.getItem("adminToken");
            const res = await fetch("/api/admin/categories", {
                method: "DELETE",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ id }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            toast.success("Category deleted");
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : "Failed to delete");
        }
    }
}
