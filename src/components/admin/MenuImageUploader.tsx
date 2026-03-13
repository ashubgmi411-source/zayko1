/**
 * MenuImageUploader — Drag & drop image uploader for menu items
 *
 * Features:
 * - Drag and drop
 * - Click to browse
 * - Preview before upload
 * - Upload progress indication
 * - Validation (type + size)
 */

"use client";
import React, { useState, useRef, useCallback } from "react";
import toast from "react-hot-toast";
import { motion, AnimatePresence } from "framer-motion";

interface MenuImageUploaderProps {
    menuItemId: string;
    currentImage?: string;
    onUploadComplete: (imageUrl: string) => void;
}

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_SIZE = 5 * 1024 * 1024; // 5MB

export default function MenuImageUploader({
    menuItemId,
    currentImage,
    onUploadComplete,
}: MenuImageUploaderProps) {
    const [preview, setPreview] = useState<string | null>(currentImage || null);
    const [uploading, setUploading] = useState(false);
    const [dragOver, setDragOver] = useState(false);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const validateFile = (file: File): string | null => {
        if (!ALLOWED_TYPES.includes(file.type)) {
            return "Only JPG, PNG, WebP images are allowed";
        }
        if (file.size > MAX_SIZE) {
            return "File size must be under 5MB";
        }
        return null;
    };

    const handleFile = useCallback((file: File) => {
        const error = validateFile(file);
        if (error) {
            toast.error(error);
            return;
        }
        setSelectedFile(file);
        const reader = new FileReader();
        reader.onload = (e) => setPreview(e.target?.result as string);
        reader.readAsDataURL(file);
    }, []);

    const handleDrop = useCallback(
        (e: React.DragEvent) => {
            e.preventDefault();
            setDragOver(false);
            const file = e.dataTransfer.files?.[0];
            if (file) handleFile(file);
        },
        [handleFile]
    );

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(true);
    }, []);

    const handleDragLeave = useCallback(() => setDragOver(false), []);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) handleFile(file);
    };

    const uploadImage = async () => {
        if (!selectedFile) return;

        setUploading(true);
        const toastId = toast.loading("Uploading image...");

        try {
            const formData = new FormData();
            formData.append("file", selectedFile);
            formData.append("menuItemId", menuItemId);

            const res = await fetch("/api/admin/upload-menu-image", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${localStorage.getItem("adminToken")}`,
                },
                body: formData,
            });

            const data = await res.json();

            if (data.success) {
                toast.success("Image uploaded! 📸", { id: toastId });
                setPreview(data.imageUrl);
                setSelectedFile(null);
                onUploadComplete(data.imageUrl);
            } else {
                toast.error(data.error || "Upload failed", { id: toastId });
            }
        } catch {
            toast.error("Network error during upload", { id: toastId });
        } finally {
            setUploading(false);
        }
    };

    const removeImage = () => {
        setPreview(null);
        setSelectedFile(null);
        if (inputRef.current) inputRef.current.value = "";
    };

    return (
        <div className="space-y-3">
            <label className="text-xs font-bold text-zayko-400 uppercase tracking-wider block">
                📸 Item Image
            </label>

            <AnimatePresence mode="wait">
                {preview ? (
                    <motion.div
                        key="preview"
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="relative rounded-xl overflow-hidden border border-white/[0.08]"
                    >
                        <img
                            src={preview}
                            alt="Preview"
                            className="w-full h-40 object-cover"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />

                        {/* Actions overlay */}
                        <div className="absolute bottom-2 right-2 flex gap-2">
                            {selectedFile && (
                                <button
                                    onClick={uploadImage}
                                    disabled={uploading}
                                    className="px-3 py-1.5 bg-emerald-500 text-white text-xs font-bold rounded-lg hover:bg-emerald-400 transition-all disabled:opacity-50 flex items-center gap-1.5"
                                >
                                    {uploading ? (
                                        <>
                                            <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                            Uploading...
                                        </>
                                    ) : (
                                        "✓ Upload"
                                    )}
                                </button>
                            )}
                            <button
                                onClick={removeImage}
                                disabled={uploading}
                                className="px-3 py-1.5 bg-red-500/80 text-white text-xs font-bold rounded-lg hover:bg-red-400 transition-all disabled:opacity-50"
                            >
                                ✕ Remove
                            </button>
                        </div>

                        {/* Uploaded badge */}
                        {!selectedFile && preview && (
                            <div className="absolute top-2 left-2">
                                <span className="px-2 py-0.5 bg-emerald-500/90 text-white text-[9px] font-bold rounded-md">
                                    ✓ UPLOADED
                                </span>
                            </div>
                        )}
                    </motion.div>
                ) : (
                    <motion.div
                        key="dropzone"
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        onDrop={handleDrop}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onClick={() => inputRef.current?.click()}
                        className={`relative h-32 rounded-xl border-2 border-dashed cursor-pointer transition-all duration-200 flex flex-col items-center justify-center gap-2 ${
                            dragOver
                                ? "border-gold-400 bg-gold-400/10"
                                : "border-zayko-600 bg-zayko-700/30 hover:border-zayko-500 hover:bg-zayko-700/50"
                        }`}
                    >
                        <span className="text-2xl">{dragOver ? "📥" : "📷"}</span>
                        <p className="text-xs text-zayko-400 text-center px-4">
                            {dragOver
                                ? "Drop your image here"
                                : "Drag & drop or click to browse"}
                        </p>
                        <p className="text-[10px] text-zayko-600">
                            JPG, PNG, WebP · Max 5MB
                        </p>
                    </motion.div>
                )}
            </AnimatePresence>

            <input
                ref={inputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleInputChange}
                className="hidden"
            />
        </div>
    );
}
