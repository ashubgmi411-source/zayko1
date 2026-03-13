/**
 * Runtime environment variable validation.
 * Imported by firebase-admin.ts — throws on first API call if misconfigured.
 * 
 * SECURITY: Prevents silent failures from missing env vars that could
 * lead to open admin fallbacks or broken auth.
 */

const REQUIRED_ENV_VARS = [
    "NEXT_PUBLIC_FIREBASE_API_KEY",
    "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
    "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
    "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
    "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
    "NEXT_PUBLIC_FIREBASE_APP_ID",
    "FIREBASE_ADMIN_PROJECT_ID",
    "FIREBASE_ADMIN_CLIENT_EMAIL",
    "FIREBASE_ADMIN_PRIVATE_KEY",
    "ADMIN_USERNAME",
    "ADMIN_PASSWORD",
    "ADMIN_SECRET",
] as const;

const PLACEHOLDER_VALUES = [
    "your_api_key",
    "your_project_id",
    "your_service_account_email",
    "your_jwt_secret_here",
    "your_admin_username",
    "your_admin_password",
];

let validated = false;

export function validateEnv(): void {
    if (validated) return;

    // Skip validation during Next.js build phase (Railway injects env vars at runtime, not build time)
    const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";

    const missing: string[] = [];
    const placeholder: string[] = [];

    for (const key of REQUIRED_ENV_VARS) {
        const value = process.env[key];
        if (!value) {
            missing.push(key);
        } else if (PLACEHOLDER_VALUES.some((p) => value.toLowerCase() === p.toLowerCase())) {
            placeholder.push(key);
        }
    }

    if (missing.length > 0) {
        if (isBuildPhase) {
            console.warn(
                `[ENV] ⚠ Build phase: ${missing.length} env vars not yet available (will be injected at runtime).`
            );
            validated = true;
            return;
        }
        throw new Error(
            `[ENV] Missing required environment variables:\n${missing.map((k) => `  - ${k}`).join("\n")}\n\nCheck your .env.local file.`
        );
    }

    if (placeholder.length > 0) {
        console.warn(
            `[ENV] Warning: The following variables still have placeholder values:\n${placeholder.map((k) => `  - ${k}`).join("\n")}`
        );
    }

    validated = true;
}
