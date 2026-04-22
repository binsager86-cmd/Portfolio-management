/**
 * Sanitize text before rendering into PDF via jsPDF.
 *
 * jsPDF's doc.text() writes directly to the PDF canvas — it does NOT
 * parse HTML, so traditional XSS is not a vector.  However, we still
 * guard against:
 *   • Control characters that can corrupt PDF structure
 *   • Excessively long strings that can crash rendering
 *   • Null/undefined values leaking as literal "null"/"undefined"
 */

// eslint-disable-next-line no-control-regex -- intentional: strips PDF-corrupting control characters
const CONTROL_CHAR_RE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

/**
 * Strip control characters and clamp length for PDF text output.
 * Safe to call on any value — coerces to string first.
 */
export function sanitizePdfText(
  value: unknown,
  maxLength = 500,
): string {
  if (value == null) return "";
  const raw = String(value);
  const cleaned = raw.replace(CONTROL_CHAR_RE, "");
  return cleaned.length > maxLength
    ? cleaned.slice(0, maxLength - 1) + "…"
    : cleaned;
}
