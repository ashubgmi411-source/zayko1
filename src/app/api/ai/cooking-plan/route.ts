/**
 * /api/ai/cooking-plan — Admin API for Jarvis 2.0 AI Brain
 *
 * GET: Fetch the cooking plan for a specific date (defaults to tomorrow)
 * POST: Force regenerate the cooking plan via AI
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/admin-auth";
import { generateCookingPlan, getCookingPlan } from "@/services/cookingPlanService";

// Prevent Vercel from caching this route or edge deploying it (since it uses node modules + firestore)
export const runtime = "nodejs";
export const revalidate = 0;

export async function GET(req: NextRequest) {
    // SECURITY: Requires Admin JWT
    const admin = verifyAdmin(req);
    if (!admin) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    let dateStr = searchParams.get("date");

    if (!dateStr) {
        // Default to tomorrow
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        dateStr = tomorrow.toISOString().split("T")[0];
    }

    try {
        let plan = await getCookingPlan(dateStr);
        if (!plan) {
            // Generate it on the fly if it hasn't been generated yet
            plan = await generateCookingPlan(dateStr);
        }

        return NextResponse.json({ success: true, plan });
    } catch (error) {
        console.error("[Jarvis Brain] Failed to fetch/generate cooking plan:", error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Internal Server Error" },
            { status: 500 }
        );
    }
}

export async function POST(req: NextRequest) {
    // SECURITY: Requires Admin JWT OR Cron Secret
    const cronSecretHeader = req.headers.get("x-cron-secret");
    const admin = verifyAdmin(req);

    if (!admin && cronSecretHeader !== process.env.CRON_SECRET) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const body = await req.json().catch(() => ({}));
        const dateStr = body.date; // Optional: force a specific date

        const plan = await generateCookingPlan(dateStr);
        return NextResponse.json({ success: true, plan });
    } catch (error) {
        console.error("[Jarvis Brain] Failed to force generate cooking plan:", error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Internal Server Error" },
            { status: 500 }
        );
    }
}
