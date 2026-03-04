/**
 * Auth error mapping — converts raw API/network errors to user-friendly messages.
 *
 * Structured to be compatible with Sentry error tracking:
 *   - Each error has a code, message, and severity
 *   - Original error is preserved for logging/debugging
 *
 * Usage:
 *   catch (err) {
 *     const mapped = mapAuthError(err, "login");
 *     set({ error: mapped.message });
 *     logAuthError(mapped);
 *   }
 */

import { AxiosError } from "axios";

// ── Error severity levels ───────────────────────────────────────────

export type ErrorSeverity = "info" | "warning" | "error" | "fatal";

// ── Mapped error shape ──────────────────────────────────────────────

export interface AuthError {
  /** Machine-readable error code for analytics/Sentry. */
  code: string;
  /** User-facing message to display in the UI. */
  message: string;
  /** Severity level for error tracking. */
  severity: ErrorSeverity;
  /** HTTP status code, if applicable. */
  statusCode?: number;
  /** Raw error detail from the server, if any. */
  serverDetail?: string;
  /** Original error object for debugging. */
  originalError?: unknown;
}

// ── Error code → user message mappings ──────────────────────────────

const LOGIN_ERROR_MAP: Record<number, { code: string; message: string; severity: ErrorSeverity }> = {
  401: {
    code: "auth/invalid-credentials",
    message: "Invalid username or password. Please try again.",
    severity: "warning",
  },
  400: {
    code: "auth/account-locked",
    message: "Account is temporarily locked due to too many failed attempts. Please try again later.",
    severity: "warning",
  },
  403: {
    code: "auth/forbidden",
    message: "Access denied. Your account may be suspended.",
    severity: "error",
  },
  404: {
    code: "auth/user-not-found",
    message: "No account found with this username.",
    severity: "warning",
  },
  429: {
    code: "auth/rate-limited",
    message: "Too many login attempts. Please wait a minute and try again.",
    severity: "info",
  },
  500: {
    code: "auth/server-error",
    message: "Server error. Please try again later.",
    severity: "error",
  },
  503: {
    code: "auth/service-unavailable",
    message: "Service is temporarily unavailable. Please try again later.",
    severity: "error",
  },
};

const REGISTER_ERROR_MAP: Record<number, { code: string; message: string; severity: ErrorSeverity }> = {
  409: {
    code: "auth/username-taken",
    message: "This username is already taken. Please choose a different one.",
    severity: "warning",
  },
  400: {
    code: "auth/invalid-input",
    message: "Invalid registration details. Please check your input.",
    severity: "warning",
  },
  422: {
    code: "auth/validation-error",
    message: "Please check your registration details and try again.",
    severity: "warning",
  },
  429: {
    code: "auth/rate-limited",
    message: "Too many registration attempts. Please wait a minute and try again.",
    severity: "info",
  },
  500: {
    code: "auth/server-error",
    message: "Server error during registration. Please try again later.",
    severity: "error",
  },
};

// ── Main mapper ─────────────────────────────────────────────────────

/**
 * Convert a raw API/network error into a structured AuthError.
 *
 * @param err - The caught error (usually AxiosError)
 * @param context - "login" | "register" | "google" — determines error map
 */
export function mapAuthError(
  err: unknown,
  context: "login" | "register" | "google" = "login"
): AuthError {
  const errorMap = context === "register" ? REGISTER_ERROR_MAP : LOGIN_ERROR_MAP;

  // ── Axios error with server response ──────────────────────────────
  if (isAxiosError(err) && err.response) {
    const status = err.response.status;
    const detail = extractDetail(err.response.data);
    const mapped = errorMap[status];

    if (mapped) {
      return {
        ...mapped,
        statusCode: status,
        // Use server detail if it's more specific than our generic message
        message: detail || mapped.message,
        serverDetail: detail || undefined,
        originalError: err,
      };
    }

    // Unmapped status code
    return {
      code: `auth/http-${status}`,
      message: detail || `Unexpected error (${status}). Please try again.`,
      severity: status >= 500 ? "error" : "warning",
      statusCode: status,
      serverDetail: detail || undefined,
      originalError: err,
    };
  }

  // ── Timeout ───────────────────────────────────────────────────────
  if (isAxiosError(err) && err.code === "ECONNABORTED") {
    return {
      code: "auth/timeout",
      message: "Request timed out. Please check your connection and try again.",
      severity: "warning",
      originalError: err,
    };
  }

  // ── Network error (no response at all) ────────────────────────────
  if (isAxiosError(err) && !err.response) {
    return {
      code: "auth/network-error",
      message: "Cannot reach the server. Please check your internet connection.",
      severity: "error",
      originalError: err,
    };
  }

  // ── Generic JS error ──────────────────────────────────────────────
  if (err instanceof Error) {
    return {
      code: "auth/unknown",
      message: err.message || "An unexpected error occurred. Please try again.",
      severity: "error",
      originalError: err,
    };
  }

  // ── Truly unknown ─────────────────────────────────────────────────
  return {
    code: "auth/unknown",
    message: "An unexpected error occurred. Please try again.",
    severity: "error",
    originalError: err,
  };
}

// ── Logger (Flipper / Sentry compatible) ────────────────────────────

/**
 * Log an auth error to console (and optionally Sentry).
 *
 * Console output is formatted for easy reading in React Native Flipper.
 * If Sentry is configured, call Sentry.captureException() with the
 * original error and structured context tags.
 */
export function logAuthError(authError: AuthError, context?: string): void {
  const tag = `[AUTH:${authError.code}]`;
  const ctx = context ? ` (${context})` : "";

  if (authError.severity === "error" || authError.severity === "fatal") {
    console.error(`${tag}${ctx} ${authError.message}`, {
      code: authError.code,
      severity: authError.severity,
      statusCode: authError.statusCode,
      serverDetail: authError.serverDetail,
    });
  } else {
    console.warn(`${tag}${ctx} ${authError.message}`);
  }

  // Sentry integration (uncomment when Sentry is installed):
  // if (authError.originalError instanceof Error) {
  //   Sentry.captureException(authError.originalError, {
  //     tags: { authCode: authError.code, severity: authError.severity },
  //     extra: { serverDetail: authError.serverDetail, statusCode: authError.statusCode },
  //   });
  // }
}

// ── Helpers ─────────────────────────────────────────────────────────

function isAxiosError(err: unknown): err is AxiosError {
  return (err as any)?.isAxiosError === true;
}

function extractDetail(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;

  // FastAPI standard error format: { detail: "..." }
  if (typeof d.detail === "string") return d.detail;

  // Pydantic validation errors: { detail: [{ msg: "..." }, ...] }
  if (Array.isArray(d.detail)) {
    return d.detail
      .map((e: any) => e.msg || e.message || JSON.stringify(e))
      .join(". ");
  }

  // Alternative format: { message: "..." }
  if (typeof d.message === "string") return d.message;

  return null;
}
