/**
 * POST /api/scheduled-order/cancel — Cancel a scheduled order
 *
 * SECURITY:
 * - Requires Firebase ID token
 * - Verifies ownership (userId matches caller)
 * - Only cancels orders with status "scheduled"
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
        const { orderId } = await req.json();

        if (!orderId) {
            return NextResponse.json({ error: "orderId is required" }, { status: 400 });
        }

        const docRef = adminDb.collection("scheduled_orders").doc(orderId);
        const doc = await docRef.get();

        if (!doc.exists) {
            return NextResponse.json({ error: "Scheduled order not found" }, { status: 404 });
        }

        const data = doc.data()!;

        // SECURITY: Verify ownership
        if (data.userId !== uid) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        // Only cancel if still scheduled
        if (data.status !== "scheduled") {
            return NextResponse.json(
                { error: `Cannot cancel order with status "${data.status}"` },
                { status: 400 }
            );
        }

        await docRef.update({
            status: "cancelled",
            updatedAt: new Date().toISOString(),
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("[ScheduledOrder] Cancel failed:", error);
        return NextResponse.json(
            { error: "Failed to cancel scheduled order" },
            { status: 500 }
        );
    }
}
