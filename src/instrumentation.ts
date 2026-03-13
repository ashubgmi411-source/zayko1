/**
 * Next.js Instrumentation — Runs once when the server starts.
 *
 * Sets up node-cron jobs for background tasks on Railway deployment:
 * 1. Scheduled order execution — every minute
 * 2. Recurring auto-order execution — daily at midnight
 */

export async function register() {
    // Only run cron jobs on the server (Node.js runtime), not during build
    if (process.env.NEXT_RUNTIME === "nodejs") {
        const cron = await import("node-cron");

        const BASE_URL =
            process.env.RAILWAY_PUBLIC_DOMAIN
                ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
                : process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

        const CRON_SECRET = process.env.CRON_SECRET || "";

        // ── Scheduled Orders: Execute every minute ──────────────
        cron.default.schedule("* * * * *", async () => {
            try {
                const res = await fetch(`${BASE_URL}/api/scheduled-order/execute`, {
                    headers: CRON_SECRET
                        ? { "x-cron-secret": CRON_SECRET }
                        : {},
                });
                const data = await res.json();
                if (data.processed > 0) {
                    console.log(
                        `[Cron] Scheduled orders: ${data.processed} processed, results:`,
                        data.results
                    );
                }
            } catch (err) {
                console.error("[Cron] Scheduled order execution failed:", err);
            }
        });

        // ── Auto Orders: Execute daily at midnight ──────────────
        cron.default.schedule("0 0 * * *", async () => {
            try {
                const res = await fetch(`${BASE_URL}/api/auto-orders/execute`, {
                    headers: CRON_SECRET
                        ? { "x-cron-secret": CRON_SECRET }
                        : {},
                });
                const data = await res.json();
                console.log("[Cron] Auto orders:", data);
            } catch (err) {
                console.error("[Cron] Auto order execution failed:", err);
            }
        });

        // ── AI Cooking Plan: Execute daily at 2:00 AM ───────────
        cron.default.schedule("0 2 * * *", async () => {
            try {
                const res = await fetch(`${BASE_URL}/api/ai/cooking-plan`, {
                    method: "POST",
                    headers: CRON_SECRET
                        ? { "x-cron-secret": CRON_SECRET, "Content-Type": "application/json" }
                        : { "Content-Type": "application/json" },
                });
                const data = await res.json();
                console.log("[Cron] AI Cooking Plan Generated:", data.success ? "Success" : "Failed");
            } catch (err) {
                console.error("[Cron] AI Cooking Plan execution failed:", err);
            }
        });

        console.log("[Cron] ✅ Scheduled order cron (every min) + Auto order cron (daily) + AI Plan cron (2AM) started");
    }
}
