/**
 * /api/admin/demand-forecast — Admin Demand Forecast API
 *
 * GET — Aggregates all dailyDemands records grouped by day → item.
 * Protected by admin JWT.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { verifyAdmin } from "@/lib/admin-auth";

const ALL_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export async function GET(req: NextRequest) {
    const admin = verifyAdmin(req);
    if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        console.log("[DemandForecast] Starting aggregation...");

        const snap = await adminDb.collection("dailyDemands").get();
        console.log(`[DemandForecast] Found ${snap.size} demand records`);

        // Single-pass aggregation
        const demandByDay: Record<string, Record<string, { qty: number; users: Set<string> }>> = {};
        for (const day of ALL_DAYS) demandByDay[day] = {};

        const uniqueUsers = new Set<string>();

        snap.forEach((doc) => {
            const d = doc.data();
            // Skip inactive/paused demands
            if (d.isActive === false) return;
            const userId: string = d.userId;
            const itemName: string = d.itemName || "Unknown";
            const quantity: number = d.quantity || 0;
            const days: string[] = d.days || [];

            uniqueUsers.add(userId);

            for (const day of days) {
                if (!demandByDay[day]) continue;
                if (!demandByDay[day][itemName]) {
                    demandByDay[day][itemName] = { qty: 0, users: new Set() };
                }
                demandByDay[day][itemName].qty += quantity;
                demandByDay[day][itemName].users.add(userId);
            }
        });

        // Serialize for JSON
        const forecast: Record<string, Array<{ itemName: string; totalQty: number; uniqueUsers: number }>> = {};
        for (const day of ALL_DAYS) {
            forecast[day] = Object.entries(demandByDay[day])
                .map(([itemName, data]) => ({
                    itemName,
                    totalQty: data.qty,
                    uniqueUsers: data.users.size,
                }))
                .sort((a, b) => b.totalQty - a.totalQty);
        }

        // Summary
        const dayTotals = ALL_DAYS.map((day) => ({
            day,
            total: forecast[day].reduce((s, i) => s + i.totalQty, 0),
        }));

        const allItems: Record<string, number> = {};
        for (const day of ALL_DAYS) {
            for (const item of forecast[day]) {
                allItems[item.itemName] = (allItems[item.itemName] || 0) + item.totalQty;
            }
        }

        let topItem = "—";
        let topItemQty = 0;
        for (const [name, qty] of Object.entries(allItems)) {
            if (qty > topItemQty) { topItemQty = qty; topItem = name; }
        }

        const peakDay = dayTotals.reduce((a, b) => b.total > a.total ? b : a, { day: "—", total: 0 });

        const summary = {
            totalDemands: snap.size,
            uniqueUsers: uniqueUsers.size,
            topItem,
            topItemQty,
            peakDay: peakDay.day,
            peakDayQty: peakDay.total,
        };

        console.log("[DemandForecast] Aggregation complete:", JSON.stringify(summary));

        return NextResponse.json({ success: true, forecast, dayTotals, summary });
    } catch (err) {
        console.error("[DemandForecast] Error:", err);
        return NextResponse.json({ error: "Failed to aggregate" }, { status: 500 });
    }
}
