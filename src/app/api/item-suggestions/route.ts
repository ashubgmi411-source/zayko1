/**
 * /api/item-suggestions — User Item Suggestion API
 *
 * GET  — Returns suggestions the authenticated user has participated in.
 * POST — Creates a new suggestion OR upvotes an existing one (dedup via normalizedName).
 *        Uses Firestore transaction for atomic increment.
 *        Prevents same user from requesting the same item twice.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { getAuthenticatedUser } from "@/lib/user-auth";
import { FieldValue } from "firebase-admin/firestore";

// ─── GET ────────────────────────────────────────
export async function GET(req: NextRequest) {
    const uid = await getAuthenticatedUser(req);
    if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        const snap = await adminDb
            .collection("itemSuggestions")
            .where("requestedBy", "array-contains", uid)
            .orderBy("createdAt", "desc")
            .get();

        const suggestions = snap.docs.map((d) => ({
            id: d.id,
            ...d.data(),
            // Strip requestedBy for privacy — user only needs their own status
            requestedBy: undefined,
            userRequested: true,
        }));

        return NextResponse.json({ success: true, suggestions });
    } catch (err) {
        console.error("[ItemSuggestions] GET error:", err);
        return NextResponse.json({ error: "Failed to fetch suggestions" }, { status: 500 });
    }
}

// ─── POST ───────────────────────────────────────
export async function POST(req: NextRequest) {
    const uid = await getAuthenticatedUser(req);
    if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        const body = await req.json();
        const { itemName, category, description, expectedPrice } = body;

        if (!itemName || typeof itemName !== "string" || itemName.trim().length < 2) {
            return NextResponse.json({ error: "Item name is required (min 2 characters)" }, { status: 400 });
        }

        const normalizedName = itemName.trim().toLowerCase();

        // Check if suggestion already exists
        const existingSnap = await adminDb
            .collection("itemSuggestions")
            .where("normalizedName", "==", normalizedName)
            .limit(1)
            .get();

        if (!existingSnap.empty) {
            // Existing suggestion — upvote it
            const existingDoc = existingSnap.docs[0];
            const existingData = existingDoc.data();

            // Check if user already requested this
            if (existingData.requestedBy?.includes(uid)) {
                return NextResponse.json({
                    error: "You already requested this item",
                    alreadyRequested: true,
                }, { status: 409 });
            }

            // Atomic increment via transaction
            await adminDb.runTransaction(async (tx) => {
                const freshDoc = await tx.get(existingDoc.ref);
                if (!freshDoc.exists) throw new Error("Document disappeared");

                const freshData = freshDoc.data()!;
                if (freshData.requestedBy?.includes(uid)) {
                    throw new Error("Already requested");
                }

                tx.update(existingDoc.ref, {
                    totalRequests: FieldValue.increment(1),
                    requestedBy: FieldValue.arrayUnion(uid),
                    updatedAt: new Date().toISOString(),
                });
            });

            console.log(`[ItemSuggestions] Upvoted "${itemName}" by user ${uid} (doc: ${existingDoc.id})`);

            return NextResponse.json({
                success: true,
                action: "upvoted",
                suggestionId: existingDoc.id,
            });
        }

        // New suggestion
        const now = new Date().toISOString();
        const suggestionData: Record<string, unknown> = {
            itemName: itemName.trim(),
            normalizedName,
            totalRequests: 1,
            requestedBy: [uid],
            status: "pending",
            createdAt: now,
            updatedAt: now,
        };

        if (category && typeof category === "string") suggestionData.category = category.trim();
        if (description && typeof description === "string") suggestionData.description = description.trim();
        if (expectedPrice && typeof expectedPrice === "number" && expectedPrice > 0) {
            suggestionData.expectedPrice = expectedPrice;
        }

        const ref = await adminDb.collection("itemSuggestions").add(suggestionData);
        console.log(`[ItemSuggestions] Created new suggestion "${itemName}" by user ${uid} (doc: ${ref.id})`);

        return NextResponse.json({
            success: true,
            action: "created",
            suggestionId: ref.id,
        });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unknown error";
        if (message === "Already requested") {
            return NextResponse.json({ error: "You already requested this item" }, { status: 409 });
        }
        console.error("[ItemSuggestions] POST error:", err);
        return NextResponse.json({ error: "Failed to submit suggestion" }, { status: 500 });
    }
}

// ─── PATCH ──────────────────────────────────────
export async function PATCH(req: NextRequest) {
    const uid = await getAuthenticatedUser(req);
    if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Suggestion id required" }, { status: 400 });

    try {
        const docRef = adminDb.collection("itemSuggestions").doc(id);
        const docSnap = await docRef.get();

        if (!docSnap.exists) return NextResponse.json({ error: "Not found" }, { status: 404 });

        const data = docSnap.data()!;
        // Only allow editing own suggestions
        if (!data.requestedBy?.includes(uid)) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
        // Only allow editing pending suggestions
        if (data.status !== "pending") {
            return NextResponse.json({ error: "Can only edit pending suggestions" }, { status: 400 });
        }

        const body = await req.json();
        const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };

        if (body.itemName !== undefined) {
            if (typeof body.itemName !== "string" || body.itemName.trim().length < 2) {
                return NextResponse.json({ error: "Item name min 2 characters" }, { status: 400 });
            }
            updates.itemName = body.itemName.trim();
            updates.normalizedName = body.itemName.trim().toLowerCase();
        }
        if (body.category !== undefined) updates.category = typeof body.category === "string" ? body.category.trim() : "";
        if (body.description !== undefined) updates.description = typeof body.description === "string" ? body.description.trim() : "";
        if (body.expectedPrice !== undefined) {
            updates.expectedPrice = typeof body.expectedPrice === "number" && body.expectedPrice > 0 ? body.expectedPrice : 0;
        }

        await docRef.update(updates);
        console.log(`[ItemSuggestions] Updated suggestion ${id} by user ${uid}`);
        return NextResponse.json({ success: true });
    } catch (err) {
        console.error("[ItemSuggestions] PATCH error:", err);
        return NextResponse.json({ error: "Failed to update suggestion" }, { status: 500 });
    }
}

// ─── DELETE ─────────────────────────────────────
export async function DELETE(req: NextRequest) {
    const uid = await getAuthenticatedUser(req);
    if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Suggestion id required" }, { status: 400 });

    try {
        const docRef = adminDb.collection("itemSuggestions").doc(id);
        const docSnap = await docRef.get();

        if (!docSnap.exists) return NextResponse.json({ error: "Not found" }, { status: 404 });

        const data = docSnap.data()!;
        if (!data.requestedBy?.includes(uid)) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
        if (data.status !== "pending") {
            return NextResponse.json({ error: "Can only delete pending suggestions" }, { status: 400 });
        }

        await docRef.delete();
        console.log(`[ItemSuggestions] Deleted suggestion ${id} by user ${uid}`);
        return NextResponse.json({ success: true });
    } catch (err) {
        console.error("[ItemSuggestions] DELETE error:", err);
        return NextResponse.json({ error: "Failed to delete suggestion" }, { status: 500 });
    }
}
