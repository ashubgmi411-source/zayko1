/**
 * Admin Revenue API — Custom Date Range Financial Analytics
 * 
 * Computes Gross Revenue, Refunds, Net Revenue, and Wallet Topups
 * securely for a given date range.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { verifyAdmin } from "@/lib/admin-auth";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
    // SECURITY: Require valid admin JWT
    if (!verifyAdmin(req)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const { searchParams } = new URL(req.url);
        const startDateStr = searchParams.get("startDate");
        const endDateStr = searchParams.get("endDate");

        if (!startDateStr || !endDateStr) {
            return NextResponse.json({ error: "Missing start or end date" }, { status: 400 });
        }

        // Validate and format dates (ensure endDate covers the entire day if only YYYY-MM-DD is passed)
        const startDate = new Date(startDateStr);
        const endDate = new Date(endDateStr);

        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
            return NextResponse.json({ error: "Invalid date format" }, { status: 400 });
        }

        // Ensure end date covers up to 23:59:59.999 of the selected day if it's strictly a date string
        if (endDateStr.length <= 10) {
            endDate.setUTCHours(23, 59, 59, 999);
        }

        const startIso = startDate.toISOString();
        const endIso = endDate.toISOString();

        // 1. Fetch Orders within date range
        // Note: 'status' isn't indexed with 'createdAt' in standard setups, so we fetch all 
        // in range and filter in memory. This is highly optimized for ranges.
        const ordersSnap = await adminDb
            .collection("orders")
            .where("createdAt", ">=", startIso)
            .where("createdAt", "<=", endIso)
            .get();

        let grossRevenue = 0;
        let totalOrders = 0;
        let refundsFromOrders = 0;

        ordersSnap.docs.forEach((doc) => {
            const data = doc.data();
            const total = data.total || 0;
            const status = data.status;

            if (status === "cancelled") {
                refundsFromOrders += total;
            } else {
                grossRevenue += total;
                totalOrders += 1;
            }
        });

        // 2. Fetch Wallet Transactions within date range
        // Types: "credit" (top-ups), "refund" (admin issued refunds not tied to standard order cancel flow, though handled above)
        const txnSnap = await adminDb
            .collection("walletTransactions")
            .where("createdAt", ">=", startIso)
            .where("createdAt", "<=", endIso)
            .get();

        let walletTopups = 0;
        let additionalRefunds = 0;

        txnSnap.docs.forEach((doc) => {
            const data = doc.data();
            const amount = data.amount || 0;
            const type = data.type;

            if (type === "credit") {
                walletTopups += amount;
            } else if (type === "refund") {
                // To prevent double counting cancelled orders, we ensure the description 
                // doesn't match an auto-cancelled order refund, or we trust the orders sum. 
                // In this architecture, cancelled orders create a "refund" txn.
                // We'll rely on the `txn` collection for the truth of refunds and topups.
                additionalRefunds += amount;
            }
        });

        // We use `additionalRefunds` from the transaction ledger as the single source of truth for refunds
        // because it captures both order cancellations and potential manual admin refunds.
        const netRevenue = grossRevenue - additionalRefunds;

        return NextResponse.json({
            success: true,
            data: {
                grossRevenue,
                totalOrders,
                refunds: additionalRefunds,
                netRevenue,
                walletTopups,
                dateRange: {
                    start: startIso,
                    end: endIso
                }
            }
        });

    } catch (error) {
        console.error("[Revenue API] Error calculating revenue:", error);
        return NextResponse.json({ error: "Failed to calculate revenue" }, { status: 500 });
    }
}
