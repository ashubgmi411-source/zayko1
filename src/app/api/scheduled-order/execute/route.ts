/**
 * GET /api/scheduled-order/execute — Cron-triggered scheduled order execution
 *
 * Called every minute by an external cron service (Vercel Cron, cron-job.org, etc.)
 *
 * Logic:
 * 1. Query scheduled_orders where status == "scheduled" AND scheduledDateTime <= now
 * 2. For each matching order (in a Firestore transaction):
 *    - Verify wallet balance
 *    - Check menu item stock
 *    - Deduct wallet
 *    - Decrement menu item quantities
 *    - Create entry in "orders" collection (same as normal orders)
 *    - Record wallet transaction
 *    - Deduct raw ingredient inventory
 *    - Update scheduled_order status to "completed"
 * 3. If wallet insufficient → mark as "failed"
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { generateOrderId } from "@/lib/orderIdUtils";
import { FieldValue } from "firebase-admin/firestore";
import { deductInventoryForOrder } from "@/services/inventoryService";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
    // Optional: verify CRON_SECRET for security
    const cronSecret = req.headers.get("x-cron-secret");
    if (process.env.CRON_SECRET && cronSecret !== process.env.CRON_SECRET) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const now = new Date();

        // Query all due scheduled orders
        const snapshot = await adminDb
            .collection("scheduled_orders")
            .where("status", "==", "scheduled")
            .where("scheduledDateTime", "<=", now.toISOString())
            .get();

        if (snapshot.empty) {
            return NextResponse.json({
                success: true,
                processed: 0,
                message: "No scheduled orders due",
            });
        }

        const results: Array<{
            scheduledOrderId: string;
            status: "completed" | "failed";
            orderId?: string;
            reason?: string;
        }> = [];

        for (const scheduledDoc of snapshot.docs) {
            const scheduledData = scheduledDoc.data();
            const scheduledOrderId = scheduledDoc.id;

            try {
                // Calculate total
                const total = scheduledData.items.reduce(
                    (sum: number, item: { price: number; quantity: number }) =>
                        sum + item.price * item.quantity,
                    0
                );

                const orderId = generateOrderId();

                await adminDb.runTransaction(async (transaction) => {
                    // ── READ PHASE ──

                    // 1. Fetch user doc
                    const userRef = adminDb.collection("users").doc(scheduledData.userId);
                    const userDoc = await transaction.get(userRef);
                    if (!userDoc.exists) throw new Error("User not found");

                    const userData = userDoc.data()!;

                    // 2. Verify wallet balance (wallet payment only)
                    if (scheduledData.paymentMethod === "wallet") {
                        const walletBalance = userData.walletBalance || 0;
                        if (walletBalance < total) {
                            throw new Error("INSUFFICIENT_BALANCE");
                        }
                    }

                    // 3. Fetch and validate menu items
                    const itemSnapshots: Array<{
                        item: { itemId: string; name: string; quantity: number; price: number };
                        snapshot: FirebaseFirestore.DocumentSnapshot;
                    }> = [];

                    for (const item of scheduledData.items) {
                        const itemRef = adminDb.collection("menuItems").doc(item.itemId);
                        const itemDoc = await transaction.get(itemRef);
                        itemSnapshots.push({ item, snapshot: itemDoc });
                    }

                    // Validate stock
                    for (const { item, snapshot } of itemSnapshots) {
                        if (!snapshot.exists) {
                            throw new Error(`Item "${item.name}" no longer exists`);
                        }
                        const currentQty = snapshot.data()?.quantity || 0;
                        if (currentQty < item.quantity) {
                            throw new Error(
                                `Insufficient stock for "${item.name}": need ${item.quantity}, only ${currentQty} available`
                            );
                        }
                    }

                    // ── WRITE PHASE ──

                    // 4. Decrement menu item quantities
                    for (const { item, snapshot } of itemSnapshots) {
                        const itemRef = adminDb.collection("menuItems").doc(item.itemId);
                        const currentQty = snapshot.data()?.quantity || 0;
                        const newQty = currentQty - item.quantity;
                        transaction.update(itemRef, {
                            quantity: newQty,
                            available: newQty > 0,
                            updatedAt: new Date().toISOString(),
                        });
                    }

                    // 5. Deduct wallet
                    if (scheduledData.paymentMethod === "wallet") {
                        transaction.update(userRef, {
                            walletBalance: FieldValue.increment(-total),
                        });
                    }

                    // 6. Create order in "orders" collection (same shape as normal orders)
                    const orderItems = scheduledData.items.map(
                        (item: { itemId: string; name: string; quantity: number; price: number }) => ({
                            id: item.itemId,
                            name: item.name,
                            price: item.price,
                            quantity: item.quantity,
                        })
                    );

                    const orderRef = adminDb.collection("orders").doc();
                    transaction.set(orderRef, {
                        orderId,
                        userId: scheduledData.userId,
                        userName: userData.name || "Unknown",
                        userEmail: userData.email || "Unknown",
                        userPhone: userData.phone || "",
                        userRollNumber: userData.rollNumber || "",
                        items: orderItems,
                        total,
                        paymentMode: scheduledData.paymentMethod === "wallet" ? "Wallet" : "Razorpay",
                        status: "pending",
                        scheduledOrderId,
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString(),
                    });

                    // 7. Record wallet debit transaction
                    if (scheduledData.paymentMethod === "wallet") {
                        const txnRef = adminDb.collection("walletTransactions").doc();
                        transaction.set(txnRef, {
                            userId: scheduledData.userId,
                            type: "debit",
                            amount: total,
                            description: `Scheduled Order #${orderId}`,
                            transactionId: txnRef.id,
                            createdAt: new Date().toISOString(),
                        });
                    }

                    // 8. Auto-deduct raw ingredient stock
                    try {
                        const orderItemsForInventory = scheduledData.items.map(
                            (item: { itemId: string; name: string; quantity: number }) => ({
                                menuItemId: item.itemId,
                                menuItemName: item.name,
                                quantity: item.quantity,
                            })
                        );
                        await deductInventoryForOrder(transaction, orderItemsForInventory, orderId);
                    } catch (invErr) {
                        console.warn(
                            "[ScheduledOrder] Inventory deduction note:",
                            invErr instanceof Error ? invErr.message : invErr
                        );
                    }

                    // 9. Update scheduled order status
                    const scheduledRef = adminDb.collection("scheduled_orders").doc(scheduledOrderId);
                    transaction.update(scheduledRef, {
                        status: "completed",
                        resultOrderId: orderId,
                        updatedAt: new Date().toISOString(),
                    });
                });

                results.push({ scheduledOrderId, status: "completed", orderId });
                console.log(
                    `[ScheduledOrder] ✅ Executed ${scheduledOrderId} → Order #${orderId}`
                );
            } catch (execError) {
                const reason =
                    execError instanceof Error ? execError.message : "Unknown error";

                // Mark as failed
                const failureStatus =
                    reason === "INSUFFICIENT_BALANCE" ? "failed" : "failed";
                const failureReason =
                    reason === "INSUFFICIENT_BALANCE"
                        ? "Insufficient wallet balance"
                        : reason;

                await adminDb
                    .collection("scheduled_orders")
                    .doc(scheduledOrderId)
                    .update({
                        status: failureStatus,
                        failureReason,
                        updatedAt: new Date().toISOString(),
                    });

                results.push({ scheduledOrderId, status: "failed", reason: failureReason });
                console.error(
                    `[ScheduledOrder] ❌ Failed ${scheduledOrderId}: ${failureReason}`
                );
            }
        }

        return NextResponse.json({
            success: true,
            processed: snapshot.size,
            results,
        });
    } catch (error) {
        console.error("[ScheduledOrder] Execution sweep failed:", error);
        return NextResponse.json({ error: "Execution failed" }, { status: 500 });
    }
}
