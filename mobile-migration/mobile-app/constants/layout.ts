/**
 * Named constants for magic numbers used throughout the app.
 *
 * Breakpoints are re-exported from useResponsive for convenience.
 * Timing, chart, and API timeout constants live here.
 */

// Re-export breakpoints so consumers can import from one place
export { BP_TABLET, BP_DESKTOP } from "@/hooks/useResponsive";

// ── Timing ──────────────────────────────────────────────────────────

/** Short delay (ms) to defer an alert so it doesn't block navigation. */
export const ALERT_DEFER_MS = 100;

/** Timeout (ms) for long-running API operations (valuation, snapshots, AI). */
export const API_TIMEOUT_LONG = 300_000;

/** Stale-upload progress nudge delay (ms). */
export const UPLOAD_PROGRESS_NUDGE_MS = 3_000;

// ── Chart layout ────────────────────────────────────────────────────

/** Minimum container width (px) to show 5 date labels instead of 3. */
export const CHART_WIDE_LABEL_MIN = 640;

// ── File limits ─────────────────────────────────────────────────────

/** Maximum upload file size in bytes (50 MB). */
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
