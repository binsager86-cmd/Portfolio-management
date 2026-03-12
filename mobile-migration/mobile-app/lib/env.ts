/**
 * Environment variable validation utility.
 *
 * Call `validateEnv()` at app startup or screen mount to catch
 * missing / misconfigured env vars before they cause cryptic errors.
 */

// Required for core app functionality
const REQUIRED_VARS = ["EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID"] as const;

// Recommended but not blocking
const RECOMMENDED_VARS = ["EXPO_PUBLIC_API_URL"] as const;

/**
 * Validate that critical environment variables are set.
 *
 * In development: logs warnings + shows an alert for missing vars.
 * In production: logs warnings only (no alert).
 *
 * @returns `true` if all required vars are present.
 */
export function validateEnv(): boolean {
  const missing = REQUIRED_VARS.filter(
    (key) => !process.env[key] || process.env[key] === "",
  );

  const missingRecommended = RECOMMENDED_VARS.filter(
    (key) => !process.env[key] || process.env[key] === "",
  );

  if (missingRecommended.length > 0) {
    console.warn(
      "[env] ⚠️  Recommended env vars not set (using fallbacks):",
      missingRecommended,
    );
  }

  if (missing.length > 0) {
    console.error("[env] ❌ Missing required environment variables:", missing);
    console.error("[env] 💡 Copy .env.example to .env and fill in values.");

    if (__DEV__) {
      // Show alert only in dev so developer can fix immediately
      setTimeout(() => {
        if (typeof alert !== "undefined") {
          alert(
            `Missing required env vars:\n\n${missing.join("\n")}\n\nCheck .env file. See GOOGLE_AUTH_SETUP.md for instructions.`,
          );
        }
      }, 1000);
    }

    return false;
  }

  if (__DEV__) {
    console.log("[env] ✅ All required environment variables are set.");
  }

  return true;
}

/**
 * Get a typed environment variable with an optional default.
 */
export function getEnv(key: string, fallback = ""): string {
  return process.env[key] ?? fallback;
}
