/**
 * /api/daily-demands — User Daily Demand CRUD
 *
 * GET    — List user's daily demands
 * POST   — Create or update demand for an item (dedup via userId+itemId transaction)
 * PATCH  — Update quantity/days
 * DELETE — Remove a demand
 *
 * Collection: dailyDemands
 * Prevents duplicate userId+itemId — uses transaction to update quantity instead.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { getAuthenticatedUser } from "@/lib/user-auth";

const VALID_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// ─── GET ────────────────────────────────────────
export async function GET(req: NextRequest) {
    const uid = await getAuthenticatedUser(req);
    if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        const snap = await adminDb
            .collection("dailyDemands")
            .where("userId", "==", uid)
            .orderBy("createdAt", "desc")
            .get();

        const demands = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        return NextResponse.json({ success: true, demands });
    } catch (err) {
        console.error("[DailyDemands] GET error:", err);
        return NextResponse.json({ error: "Failed to fetch demands" }, { status: 500 });
    }
}

// ─── POST ───────────────────────────────────────
export async function POST(req: NextRequest) {
    const uid = await getAuthenticatedUser(req);
    if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        const body = await req.json();
        const { itemId, quantity, days } = body;

        if (!itemId || !quantity || !days?.length) {
            return NextResponse.json({ error: "itemId, quantity, and days are required" }, { status: 400 });
        }
        if (typeof quantity !== "number" || quantity < 1 || quantity > 100) {
            return NextResponse.json({ error: "Quantity must be 1–100" }, { status: 400 });
        }
        const invalidDays = days.filter((d: string) => !VALID_DAYS.includes(d));
        if (invalidDays.length > 0) {
            return NextResponse.json({ error: `Invalid days: ${invalidDays.join(", ")}` }, { status: 400 });
        }

        // Check for existing demand for same user + item (dedup via transaction)
        const existingSnap = await adminDb
            .collection("dailyDemands")
            .where("userId", "==", uid)
            .where("itemId", "==", itemId)
            .limit(1)
            .get();

        if (!existingSnap.empty) {
            // Update existing demand via transaction
            const existingDoc = existingSnap.docs[0];
            await adminDb.runTransaction(async (tx) => {
                const fresh = await tx.get(existingDoc.ref);
                if (!fresh.exists) throw new Error("Document disappeared");
                tx.update(existingDoc.ref, {
                    quantity,
                    days,
                    updatedAt: new Date().toISOString(),
                });
            });
            console.log(`[DailyDemands] Updated existing demand for user ${uid}, item ${itemId}`);
            return NextResponse.json({ success: true, action: "updated", id: existingDoc.id });
        }

        // Fetch item name
        const itemDoc = await adminDb.collection("menuItems").doc(itemId).get();
        if (!itemDoc.exists) {
            return NextResponse.json({ error: "Menu item not found" }, { status: 404 });
        }
        const itemName = itemDoc.data()?.name ?? "Unknown Item";

        const now = new Date().toISOString();
        const demandData = {
            userId: uid,
            itemId,
            itemName,
            quantity,
            days,
            isActive: true,
            createdAt: now,
            updatedAt: now,
        };

        const ref = await adminDb.collection("dailyDemands").add(demandData);
        console.log(`[DailyDemands] Created demand ${ref.id} for user ${uid}`);

        return NextResponse.json({ success: true, action: "created", id: ref.id });
    } catch (err) {
        console.error("[DailyDemands] POST error:", err);
        return NextResponse.json({ error: "Failed to save demand" }, { status: 500 });
    }
}

// ─── PATCH ──────────────────────────────────────
export async function PATCH(req: NextRequest) {
    const uid = await getAuthenticatedUser(req);
    if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Demand id required" }, { status: 400 });

    try {
        const docRef = adminDb.collection("dailyDemands").doc(id);
        const docSnap = await docRef.get();

        if (!docSnap.exists) return NextResponse.json({ error: "Not found" }, { status: 404 });
        if (docSnap.data()?.userId !== uid) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

        const body = await req.json();
        const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };

        if (body.quantity !== undefined) {
            if (typeof body.quantity !== "number" || body.quantity < 1 || body.quantity > 100) {
                return NextResponse.json({ error: "Quantity must be 1–100" }, { status: 400 });
            }
            updates.quantity = body.quantity;
        }
        if (body.isActive !== undefined) {
            if (typeof body.isActive !== "boolean") {
                return NextResponse.json({ error: "isActive must be a boolean" }, { status: 400 });
            }
            updates.isActive = body.isActive;
        }
        if (body.days !== undefined) {
            const invalidDays = body.days.filter((d: string) => !VALID_DAYS.includes(d));
            if (invalidDays.length > 0) {
                return NextResponse.json({ error: `Invalid days: ${invalidDays.join(", ")}` }, { status: 400 });
            }
            updates.days = body.days;
        }

        await docRef.update(updates);
        console.log(`[DailyDemands] Updated demand ${id}`);
        return NextResponse.json({ success: true });
    } catch (err) {
        console.error("[DailyDemands] PATCH error:", err);
        return NextResponse.json({ error: "Failed to update" }, { status: 500 });
    }
}

// ─── DELETE ─────────────────────────────────────
export async function DELETE(req: NextRequest) {
    const uid = await getAuthenticatedUser(req);
    if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Demand id required" }, { status: 400 });

    try {
        const docRef = adminDb.collection("dailyDemands").doc(id);
        const docSnap = await docRef.get();

        if (!docSnap.exists) return NextResponse.json({ error: "Not found" }, { status: 404 });
        if (docSnap.data()?.userId !== uid) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

        await docRef.delete();
        console.log(`[DailyDemands] Deleted demand ${id}`);
        return NextResponse.json({ success: true });
    } catch (err) {
        console.error("[DailyDemands] DELETE error:", err);
        return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
    }
}
