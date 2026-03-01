/**
 * /api/user-feedback — User General Feedback API
 *
 * GET  — Returns the authenticated user's submitted feedbacks
 * POST — Submit new feedback (rating, category, message)
 *
 * Collection: userFeedbacks (separate from order-linked "feedbacks")
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { getAuthenticatedUser } from "@/lib/user-auth";

const VALID_CATEGORIES = ["Food Quality", "Service", "App Issue", "Suggestion", "Other"];

// ─── GET ────────────────────────────────────────
export async function GET(req: NextRequest) {
    const uid = await getAuthenticatedUser(req);
    if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        const snap = await adminDb
            .collection("userFeedbacks")
            .where("userId", "==", uid)
            .get();

        const feedbacks = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        // Sort manually by createdAt desc
        feedbacks.sort((a: any, b: any) => (b.createdAt || "").localeCompare(a.createdAt || ""));
        return NextResponse.json({ success: true, feedbacks });
    } catch (err) {
        console.error("[UserFeedback] GET error:", err);
        return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
    }
}

// ─── POST ───────────────────────────────────────
export async function POST(req: NextRequest) {
    const uid = await getAuthenticatedUser(req);
    if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        const body = await req.json();
        const { rating, category, message } = body;

        if (!rating || typeof rating !== "number" || rating < 1 || rating > 5) {
            return NextResponse.json({ error: "Rating must be 1–5" }, { status: 400 });
        }
        if (!category || !VALID_CATEGORIES.includes(category)) {
            return NextResponse.json({ error: `Category must be one of: ${VALID_CATEGORIES.join(", ")}` }, { status: 400 });
        }
        if (!message || typeof message !== "string" || message.trim().length < 5) {
            return NextResponse.json({ error: "Message required (min 5 characters)" }, { status: 400 });
        }

        // Get user name
        const userDoc = await adminDb.collection("users").doc(uid).get();
        const userName = userDoc.data()?.name ?? "Unknown";

        const now = new Date().toISOString();
        const feedbackData = {
            userId: uid,
            userName,
            rating,
            category,
            message: message.trim(),
            status: "new",
            createdAt: now,
        };

        const ref = await adminDb.collection("userFeedbacks").add(feedbackData);
        console.log(`[UserFeedback] Created feedback ${ref.id} by user ${uid} (${category}, ${rating}★)`);

        return NextResponse.json({ success: true, id: ref.id });
    } catch (err) {
        console.error("[UserFeedback] POST error:", err);
        return NextResponse.json({ error: "Failed to submit feedback" }, { status: 500 });
    }
}
