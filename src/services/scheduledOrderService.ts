/**
 * Scheduled Order Service — Client-side API wrappers for scheduled order operations.
 */

import type { ScheduledOrder, ScheduledOrderItem } from "@/types";

export interface ScheduledOrderResponse {
    success: boolean;
    id?: string;
    scheduledOrders?: ScheduledOrder[];
    error?: string;
}

export async function createScheduledOrder(
    token: string,
    data: {
        userId: string;
        items: ScheduledOrderItem[];
        scheduledDateTime: string;
        paymentMethod: "wallet" | "razorpay";
    }
): Promise<ScheduledOrderResponse> {
    const res = await fetch("/api/scheduled-order/create", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(data),
    });
    return res.json();
}

export async function getScheduledOrders(
    token: string,
    userId: string
): Promise<ScheduledOrderResponse> {
    const res = await fetch(`/api/scheduled-order/user?userId=${userId}`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    return res.json();
}

export async function cancelScheduledOrder(
    token: string,
    orderId: string
): Promise<ScheduledOrderResponse> {
    const res = await fetch("/api/scheduled-order/cancel", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ orderId }),
    });
    return res.json();
}
