/**
 * exportMetricsPdf — Generate a professional, analyst-style PDF report
 * for financial metrics with category sections, historical tables,
 * YoY change column, trend arrows, and selective inline sparklines
 * for key return/margin ratios.
 *
 * Uses jsPDF (Helvetica built-in). Works cross-platform.
 */

import { todayISO } from "@/lib/dateUtils";
import { Platform } from "react-native";

type jsPDF = import("jspdf").jsPDF;

// ── Types ────────────────────────────────────────────────────────────

export interface MetricsCategoryData {
  label: string;
  color: string;
  metricNames: string[];
  yearData: Record<number, Record<string, number>>;
  years: number[];
}

// ── Palette ──────────────────────────────────────────────────────────

const C = {
  headerBg: "#0F172A",
  primary: "#6366F1",
  primaryLight: "#E0E7FF",
  success: "#059669",
  danger: "#DC2626",
  muted: "#64748B",
  border: "#E2E8F0",
  textDark: "#1E293B",
  textMedium: "#475569",
  textLight: "#94A3B8",
  white: "#FFFFFF",
  altRow: "#F8FAFC",
  cardBg: "#FFFFFF",
};

const CAT_COLORS: Record<string, string> = {
  profitability: "#10b981",
  liquidity: "#3b82f6",
  leverage: "#f59e0b",
  efficiency: "#8b5cf6",
  valuation: "#ec4899",
  cashflow: "#06b6d4",
  growth: "#f97316",
};

// ── Constants ────────────────────────────────────────────────────────

const ROW_H = 7.5;
const HEADER_ROW_H = 8;
const SECTION_GAP = 10;
const PAGE_MX = 14;
const PAGE_HEADER_H = 28;
const PAGE_FOOTER_H = 14;

// ── Value formatting ─────────────────────────────────────────────────

function fmtMetric(name: string, value: number): string {
  const lc = name.toLowerCase();
  const isPct =
    ["margin", "roe", "roa", "growth", "payout", "retention"].some((k) => lc.includes(k)) ||
    lc.includes("dupont") ||
    lc.includes("sustainable");
  if (isPct) return (value * 100).toFixed(1) + "%";
  if (lc.includes("days") || lc.includes("cycle")) return value.toFixed(0) + " days";
  const isMult =
    ["turnover", "coverage", "multiplier"].some((k) => lc.includes(k)) ||
    ["current ratio", "quick ratio", "cash ratio"].includes(lc);
  if (isMult) return value.toFixed(2) + "x";
  if (lc.includes("eps") || lc.includes("earnings per share")) return value.toFixed(3);
  // Abbreviate large numbers: B / M / K
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return (value / 1_000_000_000).toFixed(2) + "B";
  if (abs >= 1_000_000) return (value / 1_000_000).toFixed(2) + "M";
  if (abs >= 10_000) return (value / 1_000).toFixed(1) + "K";
  return value.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

/** Determine if a metric is a percentage/ratio type that benefits from a sparkline. */
function isSparklineMetric(name: string): boolean {
  const lc = name.toLowerCase();
  return (
    ["margin", "roe", "roa", "roic", "roce", "ratio", "yield", "payout", "retention"].some(
      (k) => lc.includes(k),
    ) ||
    lc.includes("dupont") ||
    lc.includes("sustainable")
  );
}

/** Compute YoY % change text + colour. */
function yoyChange(
  prev: number,
  curr: number,
  name: string,
): { text: string; color: string } | null {
  if (prev === 0) return null;
  const pct = ((curr - prev) / Math.abs(prev)) * 100;
  if (Math.abs(pct) < 0.05) return null;
  const lc = name.toLowerCase();
  const lowerIsBetter = lc.includes("debt") || lc.includes("leverage") || lc.includes("days");
  const improved = lowerIsBetter ? pct < 0 : pct > 0;
  return {
    text: `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`,
    color: improved ? C.success : C.danger,
  };
}

// ── Drawing primitives ───────────────────────────────────────────────

function lightenHex(hex: string, amount = 0.85): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const lr = Math.round(r + (255 - r) * amount);
  const lg = Math.round(g + (255 - g) * amount);
  const lb = Math.round(b + (255 - b) * amount);
  return `#${lr.toString(16).padStart(2, "0")}${lg.toString(16).padStart(2, "0")}${lb.toString(16).padStart(2, "0")}`;
}

function drawRoundedRect(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  fill: string,
  stroke?: string,
) {
  doc.setFillColor(fill);
  if (stroke) {
    doc.setDrawColor(stroke);
    doc.setLineWidth(0.3);
    doc.roundedRect(x, y, w, h, r, r, "FD");
  } else {
    doc.roundedRect(x, y, w, h, r, r, "F");
  }
}

function drawBadge(doc: jsPDF, x: number, y: number, text: string, bg: string, fg: string) {
  doc.setFontSize(7);
  const tw = doc.getTextWidth(text);
  const pw = tw + 6;
  drawRoundedRect(doc, x, y - 3.5, pw, 6, 1.5, bg);
  doc.setTextColor(fg);
  doc.text(text, x + 3, y);
}

/** Truncate text to fit within maxW, appending "…" if clipped. */
function truncateText(doc: jsPDF, text: string, maxW: number): string {
  if (doc.getTextWidth(text) <= maxW) return text;
  let t = text;
  while (t.length > 1 && doc.getTextWidth(t + "\u2026") > maxW) {
    t = t.slice(0, -1);
  }
  return t + "\u2026";
}

/** Draw inline sparkline — compact horizontal mini-bar chart for trend. */
function drawSparkline(
  doc: jsPDF,
  x0: number,
  y0: number,
  w: number,
  h: number,
  values: (number | null)[],
  color: string,
) {
  const nums = values.filter((v): v is number => v != null);
  if (nums.length < 2) return;
  let lo = Math.min(...nums, 0);
  let hi = Math.max(...nums);
  if (hi === lo) {
    hi += 1;
    lo -= 1;
  }
  const range = hi - lo;

  const barW = Math.min((w - 0.8 * (values.length - 1)) / values.length, 5);
  const gap =
    values.length > 1 ? (w - barW * values.length) / (values.length - 1) : 0;

  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v == null) continue;
    const norm = range > 0 ? (v - lo) / range : 0.5;
    const barH = Math.max(norm * h, 0.3);
    const bx = x0 + i * (barW + gap);
    const by = y0 + h - barH;
    doc.setFillColor(v >= 0 ? color : C.danger);
    doc.rect(bx, by, barW, barH, "F");
  }
}

// ── Main Export ──────────────────────────────────────────────────────

export async function exportMetricsPdf(
  categories: Record<string, MetricsCategoryData>,
  stockSymbol: string,
  totalMetrics: number,
) {
  const { jsPDF: JsPDF } = await import("jspdf");
  const doc = new JsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = 210;
  const H = 297;
  const mx = PAGE_MX;
  const cw = W - mx * 2;
  const maxY = H - PAGE_FOOTER_H;
  let y = 0;
  let pageNum = 1;

  // ── Page header ──────────────────────────────────────────────────
  function drawPageHeader() {
    doc.setFillColor(C.headerBg);
    doc.rect(0, 0, W, PAGE_HEADER_H, "F");
    doc.setFillColor(C.primary);
    doc.rect(0, PAGE_HEADER_H, W, 1.2, "F");

    doc.setFont("helvetica", "bold").setFontSize(15).setTextColor(C.white);
    doc.text("Financial Metrics Report", mx, 12);

    doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(C.textLight);
    doc.text(stockSymbol, mx, 20);

    drawBadge(doc, W - mx - 46, 11, `${totalMetrics} METRICS`, C.primary, C.white);

    const today = new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
    doc.setFontSize(7.5).setTextColor(C.textLight);
    doc.text(today, W - mx, 21, { align: "right" });
  }

  // ── Page footer ──────────────────────────────────────────────────
  function drawPageFooter(p: number, total?: number) {
    doc.setPage(p);
    doc.setDrawColor(C.border);
    doc.setLineWidth(0.2);
    doc.line(mx, H - 10, mx + cw, H - 10);

    doc.setFontSize(6.5).setFont("helvetica", "normal").setTextColor(C.textLight);
    doc.text("Portfolio App \u2014 Fundamental Analysis", mx, H - 6);
    const label = total ? `Page ${p} of ${total}` : `Page ${p}`;
    doc.text(label, W - mx, H - 6, { align: "right" });
  }

  function ensureSpace(needed: number) {
    if (y + needed > maxY) {
      doc.addPage();
      pageNum++;
      drawPageHeader();
      y = PAGE_HEADER_H + 6;
    }
  }

  // ── Start first page ────────────────────────────────────────────
  drawPageHeader();
  y = PAGE_HEADER_H + 6;

  // ── Summary card ─────────────────────────────────────────────────
  const catEntries = Object.entries(categories);
  const allYears = new Set<number>();
  for (const [, cat] of catEntries) for (const yr of cat.years) allYears.add(yr);
  const sortedYears = Array.from(allYears).sort((a, b) => a - b);

  const summaryH = 22;
  ensureSpace(summaryH + 4);
  drawRoundedRect(doc, mx, y, cw, summaryH, 3, C.primaryLight, C.primary);

  doc.setFont("helvetica", "bold").setFontSize(10).setTextColor(C.primary);
  doc.text("Overview", mx + 8, y + 7);

  doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(C.textMedium);
  const summaryItems = [
    `${catEntries.length} Categories`,
    `${totalMetrics} Metrics`,
    `${sortedYears.length} Year(s): ${sortedYears.map((yr) => `FY${yr}`).join(", ")}`,
  ];
  doc.text(summaryItems.join("   |   "), mx + 8, y + 15);

  y += summaryH + SECTION_GAP;

  // ── Category sections ────────────────────────────────────────────
  for (const [catKey, cat] of catEntries) {
    const { label, metricNames, yearData, years } = cat;
    const catColor = CAT_COLORS[catKey] ?? C.primary;
    const hasYoY = years.length >= 2;

    // Column layout: Metric | FY columns | YoY% (if ≥2 years)
    const yoyW = hasYoY ? 18 : 0;
    const nameCW = cw * 0.26;
    const dataAreaW = cw - nameCW - yoyW;
    const valCW = years.length > 0 ? dataAreaW / years.length : dataAreaW;

    // Section header
    const sectionHeaderH = 12;
    // Ensure the ENTIRE category table fits on one page; if not, start on a new page
    const totalSectionH = sectionHeaderH + 3 + HEADER_ROW_H + ROW_H * metricNames.length + 4;
    ensureSpace(totalSectionH);

    drawRoundedRect(doc, mx, y, cw, sectionHeaderH, 3, C.cardBg, C.border);
    drawRoundedRect(doc, mx, y, 3, sectionHeaderH, 1.5, catColor);

    doc.setFillColor(catColor);
    doc.circle(mx + 10, y + sectionHeaderH / 2, 2, "F");

    doc.setFont("helvetica", "bold").setFontSize(10).setTextColor(catColor);
    doc.text(label, mx + 16, y + sectionHeaderH / 2 + 1);

    drawBadge(
      doc,
      mx + cw - 32,
      y + sectionHeaderH / 2,
      `${metricNames.length}`,
      lightenHex(catColor),
      catColor,
    );

    y += sectionHeaderH + 3;

    // ── Table header row ──────────────────────────────────────────
    doc.setFillColor(C.headerBg);
    doc.roundedRect(mx, y, cw, HEADER_ROW_H, 1.5, 1.5, "F");

    const headerTextY = y + HEADER_ROW_H * 0.58;
    doc.setFont("helvetica", "bold").setFontSize(7).setTextColor(C.white);
    doc.text("Metric", mx + 6, headerTextY);

    for (let yi = 0; yi < years.length; yi++) {
      const xPos = mx + nameCW + yi * valCW + valCW / 2;
      doc.text(`FY${years[yi]}`, xPos, headerTextY, { align: "center" });
    }

    if (hasYoY) {
      const yoyX = mx + nameCW + years.length * valCW + yoyW / 2;
      doc.text("YoY \u0394", yoyX, headerTextY, { align: "center" });
    }

    y += HEADER_ROW_H;

    // ── Data rows — top-of-row coordinate system ──────────────────
    for (let ri = 0; ri < metricNames.length; ri++) {
      const name = metricNames[ri];
      const rowTop = y;
      const textY = rowTop + ROW_H * 0.55;
      const showSparkline = isSparklineMetric(name) && years.length >= 3;

      // Alternating row background
      if (ri % 2 === 0) {
        doc.setFillColor(C.altRow);
        doc.rect(mx, rowTop, cw, ROW_H, "F");
      }

      // Thin separator (except first row)
      if (ri > 0) {
        doc.setDrawColor(C.border);
        doc.setLineWidth(0.08);
        doc.line(mx + 2, rowTop, mx + cw - 2, rowTop);
      }

      // Metric name — truncated to fit (no wrap)
      doc.setFont("helvetica", "normal").setFontSize(6.8).setTextColor(C.textMedium);
      const sparkW = 10;
      const nameMaxW = nameCW - (showSparkline ? sparkW + 6 : 6);
      const displayName = truncateText(doc, name, nameMaxW);
      doc.text(displayName, mx + 6, textY);

      // Inline sparkline for key ratio metrics only
      if (showSparkline) {
        const sparkVals = years.map((yr) => yearData[yr]?.[name] ?? null);
        const sparkX = mx + nameCW - sparkW - 2;
        const sparkH = ROW_H * 0.5;
        const sparkY = rowTop + (ROW_H - sparkH) / 2;
        drawSparkline(doc, sparkX, sparkY, sparkW, sparkH, sparkVals, catColor);
      }

      // Values per year
      for (let yi = 0; yi < years.length; yi++) {
        const yr = years[yi];
        const val = yearData[yr]?.[name];
        const xCenter = mx + nameCW + yi * valCW + valCW / 2;

        if (val != null) {
          const formatted = fmtMetric(name, val);
          // Colour percentage values green/red based on sign
          const isPctVal = formatted.endsWith("%");
          if (isPctVal) {
            doc.setFont("helvetica", "bold").setFontSize(6.2).setTextColor(val >= 0 ? C.success : C.danger);
          } else {
            doc.setFont("helvetica", "bold").setFontSize(6.2).setTextColor(C.textDark);
          }
          const clipped = truncateText(doc, formatted, valCW - 2);
          doc.text(clipped, xCenter, textY, { align: "center" });
        } else {
          doc.setFont("helvetica", "normal").setFontSize(6.8).setTextColor(C.textLight);
          doc.text("\u2013", xCenter, textY, { align: "center" });
        }
      }

      // YoY % change column (latest year vs previous)
      if (hasYoY) {
        const lastYr = years[years.length - 1];
        const prevYr = years[years.length - 2];
        const currVal = yearData[lastYr]?.[name];
        const prevVal = yearData[prevYr]?.[name];
        const yoyX = mx + nameCW + years.length * valCW + yoyW / 2;

        if (currVal != null && prevVal != null) {
          const chg = yoyChange(prevVal, currVal, name);
          if (chg) {
            doc.setFont("helvetica", "bold").setFontSize(6.2).setTextColor(chg.color);
            doc.text(chg.text, yoyX, textY, { align: "center" });
          } else {
            doc.setFont("helvetica", "normal").setFontSize(6.5).setTextColor(C.textLight);
            doc.text("\u2014", yoyX, textY, { align: "center" });
          }
        } else {
          doc.setFont("helvetica", "normal").setFontSize(6.5).setTextColor(C.textLight);
          doc.text("\u2014", yoyX, textY, { align: "center" });
        }
      }

      y += ROW_H;
    }

    // Table bottom border
    doc.setDrawColor(C.border);
    doc.setLineWidth(0.3);
    doc.line(mx, y, mx + cw, y);

    y += SECTION_GAP;
  }

  // ── Disclaimer ───────────────────────────────────────────────────
  ensureSpace(16);
  drawRoundedRect(doc, mx, y, cw, 14, 2, C.altRow, C.border);
  doc.setFontSize(6.5).setFont("helvetica", "italic").setTextColor(C.muted);
  doc.text(
    "Disclaimer: This report is for informational purposes only and does not constitute financial advice. Metrics are computed from uploaded statements.",
    mx + 4,
    y + 5,
    { maxWidth: cw - 8 },
  );
  y += 18;

  // ── Finalize page footers ────────────────────────────────────────
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    drawPageFooter(p, totalPages);
  }

  // ── Save / share ─────────────────────────────────────────────────
  const filename = `${stockSymbol}_metrics_${todayISO()}.pdf`;

  if (Platform.OS === "web") {
    doc.save(filename);
  } else {
    const buf = doc.output("arraybuffer");
    const bytes = new Uint8Array(buf);
    const { Paths, File } = await import("expo-file-system");
    const Sharing = await import("expo-sharing");
    const file = new File(Paths.document, filename);
    file.write(bytes);
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(file.uri, {
        mimeType: "application/pdf",
        dialogTitle: "Export Metrics Report",
      });
    }
  }
}
