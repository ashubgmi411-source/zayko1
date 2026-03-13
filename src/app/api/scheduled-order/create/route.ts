/**
 * POST /api/scheduled-order/create — Create a scheduled order
 *
 * SECURITY:
 * - Requires Firebase ID token
 * - Enforces caller === userId (IDOR prevention)
 * - Validates items against live menu
 * - Validates scheduledDateTime is in the future
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { getAuthenticatedUser } from "@/lib/user-auth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
    const uid = await getAuthenticatedUser(req);
    if (!uid) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const { userId, items, scheduledDateTime, paymentMethod } = await req.json();

        // SECURITY: Prevent IDOR
        if (userId !== uid) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        // Validate items
        if (!items || !Array.isArray(items) || items.length === 0) {
            return NextResponse.json({ error: "No items provided" }, { status: 400 });
        }

        // Validate scheduledDateTime is in the future
        const scheduledDate = new Date(scheduledDateTime);
        if (isNaN(scheduledDate.getTime())) {
            return NextResponse.json({ error: "Invalid scheduled date/time" }, { status: 400 });
        }
        if (scheduledDate.getTime() <= Date.now()) {
            return NextResponse.json({ error: "Scheduled time must be in the future" }, { status: 400 });
        }

        // Validate payment method
        if (!["wallet", "razorpay"].includes(paymentMethod)) {
            return NextResponse.json({ error: "Invalid payment method" }, { status: 400 });
        }

        // Validate items against live menu
        const validatedItems = [];
        for (const item of items) {
            if (!item.itemId || !item.quantity || item.quantity <= 0) {
                return NextResponse.json(
                    { error: `Invalid item: ${item.name || "unknown"}` },
                    { status: 400 }
                );
            }

            const menuDoc = await adminDb.collection("menuItems").doc(item.itemId).get();
            if (!menuDoc.exists) {
                return NextResponse.json(
                    { error: `Item "${item.name}" not found in menu` },
                    { status: 400 }
                );
            }

            const menuData = menuDoc.data()!;
            if (!menuData.available) {
                return NextResponse.json(
                    { error: `Item "${menuData.name}" is currently unavailable` },
                    { status: 400 }
                );
            }

            validatedItems.push({
                itemId: item.itemId,
                name: menuData.name,
                quantity: item.quantity,
                price: menuData.price,
            });
        }

        // Create the scheduled order
        const now = new Date().toISOString();
        const docRef = await adminDb.collection("scheduled_orders").add({
            userId,
            items: validatedItems,
            scheduledDateTime: scheduledDate.toISOString(),
            paymentMethod,
            status: "scheduled",
            createdAt: now,
            updatedAt: now,
        });

        return NextResponse.json({
            success: true,
            id: docRef.id,
            scheduledDateTime: scheduledDate.toISOString(),
        });
    } catch (error) {
        console.error("[ScheduledOrder] Create failed:", error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Failed to create scheduled order" },
            { status: 500 }
        );
    }
}
