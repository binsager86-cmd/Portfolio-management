/**
 * Centralized date utilities.
 *
 * All user-facing dates use ISO 8601 date strings (YYYY-MM-DD).
 * Display formatting is handled here to avoid scattered
 * `new Date().toISOString().slice(0, 10)` patterns.
 */

/** Today's date as YYYY-MM-DD (local timezone). */
export function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Parse an ISO date string (YYYY-MM-DD) as local midnight.
 * Bare `new Date("2024-01-15")` is interpreted as UTC midnight,
 * which can display the wrong day in negative-offset timezones.
 */
function parseLocalDate(iso: string): Date {
  return new Date(`${iso}T00:00:00`);
}

/** Format an ISO date string for chart axis labels (e.g. "Jan 15"). */
export function formatShortDate(iso: string): string {
  return parseLocalDate(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

/** Format an ISO date string for tooltip display (e.g. "Jan 15, 2024"). */
export function formatFullDate(iso: string): string {
  return parseLocalDate(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
