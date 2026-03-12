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

import { Platform, Alert } from "react-native";
import { isAxiosError } from "axios";

/**
 * Extract a user-friendly message from any error shape.
 *
 * Priority:
 *   1. Axios `response.data.detail` (string or array of validation errors)
 *   2. Axios `response.data.message`
 *   3. Error `.message`
 *   4. Stringified error
 *   5. Fallback
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
