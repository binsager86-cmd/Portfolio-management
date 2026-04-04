/**
 * Centralized error handling utilities.
 *
 * Replaces 5+ inconsistent patterns (bare Alert.alert, console.error,
 * inline message extraction, platform-branching) with a single API.
 *
 * Usage in React Query mutations:
 *   onError: (err) => showErrorAlert("Save Failed", err),
 *
 * Usage in try-catch:
 *   catch (err) { showErrorAlert("Export Failed", err); }
 *
 * Dev-only logging:
 *   catch (err) { logError("SaveSnapshot", err); }
 */

import { isAxiosError } from "axios";
import { Alert, Platform } from "react-native";

// ── User-friendly error message mapping ─────────────────────────────

/** Maps technical error codes/patterns to user-friendly messages. */
const FRIENDLY_MESSAGES: Record<string, string> = {
  "400": "The request was invalid. Please check your input and try again.",
  "401": "Your session has expired. Please sign in again.",
  "403": "You don't have permission to perform this action.",
  "404": "The requested resource was not found.",
  "408": "The request timed out. Please try again.",
  "409": "This conflicts with an existing record. Please review and try again.",
  "422": "The data you entered is invalid. Please check and try again.",
  "429": "Too many requests. Please wait a moment and try again.",
  "500": "Something went wrong on the server. Please try again later.",
  "502": "The server is temporarily unavailable. Please try again later.",
  "503": "The service is temporarily unavailable. Please try again later.",
  "ECONNREFUSED": "Cannot connect to server. Please check your internet connection.",
  "ECONNABORTED": "The connection was interrupted. Please try again.",
  "ETIMEDOUT": "Request took too long. Please try again.",
  "ERR_NETWORK": "No internet connection. Please check your network and try again.",
  "ERR_CANCELED": "The request was cancelled.",
  "timeout": "Request took too long. Please try again.",
};

/**
 * Try to match a friendly message from the error's HTTP status or Axios code.
 * Returns undefined if no match is found.
 */
function matchFriendlyMessage(err: unknown): string | undefined {
  if (isAxiosError(err)) {
    const status = err.response?.status?.toString();
    if (status && FRIENDLY_MESSAGES[status]) return FRIENDLY_MESSAGES[status];
    if (err.code && FRIENDLY_MESSAGES[err.code]) return FRIENDLY_MESSAGES[err.code];
  }
  return undefined;
}

/**
 * Extract a user-friendly message from any error shape.
 *
 * Priority:
 *   1. Axios `response.data.detail` (string or array of validation errors)
 *   2. Axios `response.data.message`
 *   3. Friendly message based on HTTP status / Axios error code
 *   4. Error `.message`
 *   5. Stringified error
 *   6. Fallback
 */
export function extractErrorMessage(
  err: unknown,
  fallback = "An unexpected error occurred",
): string {
  if (isAxiosError(err) && err.response?.data) {
    const data = err.response.data;
    // FastAPI detail string
    if (typeof data.detail === "string") return data.detail;
    // FastAPI validation error array
    if (Array.isArray(data.detail)) {
      return data.detail
        .map((d: { loc?: string[]; msg?: string }) =>
          `${d.loc?.join(".") ?? "?"}: ${d.msg ?? "invalid"}`,
        )
        .join("; ");
    }
    if (typeof data.message === "string") return data.message;
  }

  // Map technical HTTP/network errors to user-friendly messages
  const friendly = matchFriendlyMessage(err);
  if (friendly) return friendly;

  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string" && err.length > 0) return err;

  return fallback;
}

/**
 * Cross-platform alert — uses window.alert on web, Alert.alert on native.
 */
export function showAlert(title: string, message: string): void {
  if (Platform.OS === "web") {
    window.alert(`${title}: ${message}`);
  } else {
    Alert.alert(title, message);
  }
}

/**
 * Show an error alert with automatic message extraction.
 *
 * Drop-in for React Query `onError` callbacks:
 *   onError: (err) => showErrorAlert("Save Failed", err),
 */
export function showErrorAlert(
  title: string,
  err: unknown,
  fallback?: string,
): void {
  showAlert(title, extractErrorMessage(err, fallback));
}

/**
 * Dev-only structured error logging.
 * Replaces scattered console.error calls with consistent format.
 * No-op in production builds.
 */
export function logError(context: string, err: unknown): void {
  if (!__DEV__) return;

  const message = extractErrorMessage(err);
  const status = isAxiosError(err) ? err.response?.status : undefined;
  const code = isAxiosError(err) ? err.code : undefined;

  console.error(
    `[${context}] Error:`,
    message,
    ...(status ? [`(HTTP ${status})`] : []),
    ...(code ? [`code=${code}`] : []),
  );
}
