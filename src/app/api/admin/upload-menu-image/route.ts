/**
 * POST /api/admin/upload-menu-image
 *
 * Accepts multipart/form-data with:
 *   - file: image file (jpg, png, webp, max 5MB)
 *   - menuItemId: Firestore doc ID of the menu item
 *
 * Uploads to Cloudinary (zayko/menu-items/), optimizes for mobile,
 * saves the secure_url to Firestore, and returns the URL.
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/admin-auth";
import { adminDb } from "@/lib/firebase-admin";

export const runtime = "nodejs";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_SIZE = 5 * 1024 * 1024; // 5MB

export async function POST(req: NextRequest) {
    // Auth check
    if (!verifyAdmin(req)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const formData = await req.formData();
        const file = formData.get("file") as File | null;
        const menuItemId = formData.get("menuItemId") as string | null;

        if (!file) {
            return NextResponse.json({ error: "No file provided" }, { status: 400 });
        }

        if (!menuItemId) {
            return NextResponse.json({ error: "menuItemId is required" }, { status: 400 });
        }

        // Validate file type
        if (!ALLOWED_TYPES.includes(file.type)) {
            return NextResponse.json(
                { error: "Invalid file type. Allowed: jpg, png, webp" },
                { status: 400 }
            );
        }

        // Validate file size
        if (file.size > MAX_SIZE) {
            return NextResponse.json(
                { error: "File too large. Max 5MB allowed" },
                { status: 400 }
            );
        }

        // Convert file to base64 for Cloudinary upload API
        const arrayBuffer = await file.arrayBuffer();
        const base64 = Buffer.from(arrayBuffer).toString("base64");
        const dataUri = `data:${file.type};base64,${base64}`;

        // Upload to Cloudinary
        const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
        const apiKey = process.env.CLOUDINARY_API_KEY;
        const apiSecret = process.env.CLOUDINARY_API_SECRET;

        if (!cloudName || !apiKey || !apiSecret) {
            return NextResponse.json(
                { error: "Cloudinary configuration missing" },
                { status: 500 }
            );
        }

        // Generate signature for authenticated upload
        const timestamp = Math.round(Date.now() / 1000);
        const folder = "zayko/menu-items";
        const publicId = `menu_${menuItemId}_${timestamp}`;

        // Build params string for signing (alphabetical order, no file)
        const paramsToSign = `folder=${folder}&public_id=${publicId}&timestamp=${timestamp}&transformation=c_fill,f_webp,h_512,q_auto,w_512`;

        // Create SHA1 signature
        const crypto = await import("crypto");
        const signature = crypto
            .createHash("sha1")
            .update(paramsToSign + apiSecret)
            .digest("hex");

        // Upload via Cloudinary REST API
        const cloudinaryForm = new FormData();
        cloudinaryForm.append("file", dataUri);
        cloudinaryForm.append("api_key", apiKey);
        cloudinaryForm.append("timestamp", String(timestamp));
        cloudinaryForm.append("signature", signature);
        cloudinaryForm.append("folder", folder);
        cloudinaryForm.append("public_id", publicId);
        cloudinaryForm.append("transformation", "c_fill,f_webp,h_512,q_auto,w_512");

        const cloudRes = await fetch(
            `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
            { method: "POST", body: cloudinaryForm }
        );

        if (!cloudRes.ok) {
            const errData = await cloudRes.json().catch(() => ({}));
            console.error("[Cloudinary] Upload failed:", errData);
            return NextResponse.json(
                { error: "Cloudinary upload failed" },
                { status: 500 }
            );
        }

        const cloudData = await cloudRes.json();
        const imageUrl: string = cloudData.secure_url;

        // Save URL to Firestore menu item
        await adminDb.collection("menuItems").doc(menuItemId).update({
            image: imageUrl,
            updatedAt: new Date().toISOString(),
        });

        return NextResponse.json({
            success: true,
            imageUrl,
            publicId: cloudData.public_id,
        });
    } catch (error) {
        console.error("[UploadMenuImage] Error:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
