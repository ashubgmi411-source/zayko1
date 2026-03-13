/**
 * GET /api/scheduled-order/user?userId=xxx — Fetch user's scheduled orders
 *
 * SECURITY:
 * - Requires Firebase ID token
 * - Enforces caller === userId (IDOR prevention)
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { getAuthenticatedUser } from "@/lib/user-auth";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
    const uid = await getAuthenticatedUser(req);
    if (!uid) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");

    // SECURITY: Prevent IDOR
    if (userId !== uid) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    try {
        const snapshot = await adminDb
            .collection("scheduled_orders")
            .where("userId", "==", userId)
            .get();

        const scheduledOrders = snapshot.docs
            .map((doc) => ({
                id: doc.id,
                ...(doc.data() as any),
            }))
            .sort((a, b) => 
                new Date(b.scheduledDateTime).getTime() - new Date(a.scheduledDateTime).getTime()
            );

        return NextResponse.json({ success: true, scheduledOrders });
    } catch (error) {
        console.error("[ScheduledOrder] Fetch failed:", error);
        return NextResponse.json(
            { error: "Failed to fetch scheduled orders" },
            { status: 500 }
        );
    }
}
