/**
 * exportGrowthPdf — Generate a professional, branded PDF report
 * for year-over-year growth analysis with visual bar charts per metric,
 * period tables, and positive/negative colour coding.
 *
 * Uses jsPDF (Helvetica built-in). Works cross-platform.
 */

import { todayISO } from "@/lib/dateUtils";
import { Platform } from "react-native";

type jsPDF = import("jspdf").jsPDF;

// ── Types ────────────────────────────────────────────────────────────

export interface GrowthEntry {
  prev_period: string;
  period: string;
  growth: number; // decimal: 0.15 = 15%
}

// ── Palette ──────────────────────────────────────────────────────────

const C = {
  headerBg: "#0F172A",
  primary: "#6366F1",
  primaryLight: "#E0E7FF",
  success: "#059669",
  successLight: "#D1FAE5",
  danger: "#DC2626",
  dangerLight: "#FEE2E2",
  muted: "#64748B",
  border: "#E2E8F0",
  textDark: "#1E293B",
  textMedium: "#475569",
  textLight: "#94A3B8",
  white: "#FFFFFF",
  altRow: "#F8FAFC",
  cardBg: "#FFFFFF",
};

const METRIC_COLORS = [
  "#10b981", "#3b82f6", "#f59e0b", "#8b5cf6",
  "#ec4899", "#06b6d4", "#f97316", "#6366f1",
];

// ── Constants ────────────────────────────────────────────────────────

const ROW_H = 7;
const HEADER_ROW_H = 8;
const SECTION_GAP = 12;
const PAGE_MX = 14;
const PAGE_HEADER_H = 28;
const PAGE_FOOTER_H = 14;
const CHART_H = 58;
const CHART_TABLE_GAP = 8;  // gap between chart bottom and table header
const CHART_TITLE_GAP = 6;  // gap between chart title text and chart card

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

function darkenHex(hex: string, amount = 0.25): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const dr = Math.round(r * (1 - amount));
  const dg = Math.round(g * (1 - amount));
  const db = Math.round(b * (1 - amount));
  return `#${dr.toString(16).padStart(2, "0")}${dg.toString(16).padStart(2, "0")}${db.toString(16).padStart(2, "0")}`;
}

function drawRoundedRect(doc: jsPDF, x: number, y: number, w: number, h: number, r: number, fill: string, stroke?: string) {
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

// ── Growth chart drawing ─────────────────────────────────────────────

/**
 * Draw a growth bar chart for a single metric.
 * Bars go UP for positive growth, DOWN for negative,
 * centred around a zero baseline.
 * Returns total height consumed.
 */
function drawGrowthChart(
  doc: jsPDF,
  x0: number,
  y0: number,
  w: number,
  entries: GrowthEntry[],
  color: string,
): number {
  if (entries.length === 0) return 0;

  const padTop = 12;
  const padBottom = 18;
  const padLeft = 6;
  const padRight = 6;
  const plotH = CHART_H - padTop - padBottom;
  const plotW = w - padLeft - padRight;
  const plotX = x0 + padLeft;
  const plotY = y0 + padTop;

  // Background card
  drawRoundedRect(doc, x0, y0, w, CHART_H, 2, C.altRow, C.border);

  // Find max absolute growth for scale
  const absMax = Math.max(...entries.map((e) => Math.abs(e.growth)), 0.01);

  // Zero line at vertical centre of plot area
  const zeroY = plotY + plotH / 2;
  doc.setDrawColor(C.textLight);
  doc.setLineWidth(0.2);
  doc.line(plotX, zeroY, plotX + plotW, zeroY);

  // "0%" label
  doc.setFontSize(5.5).setFont("helvetica", "normal").setTextColor(C.textLight);
  doc.text("0%", plotX - 1, zeroY + 1.5, { align: "right" });

  // Bar layout
  const barGap = entries.length > 8 ? 2 : 4;
  const totalGapW = barGap * (entries.length - 1);
  const barW = Math.min((plotW - totalGapW) / entries.length, 18);
  const barsBlockW = barW * entries.length + totalGapW;
  const startX = plotX + (plotW - barsBlockW) / 2;

  const halfPlot = plotH / 2;

  for (let i = 0; i < entries.length; i++) {
    const g = entries[i];
    const pct = g.growth;
    const isPos = pct >= 0;

    // Normalise bar height relative to max
    const norm = Math.abs(pct) / absMax;
    const barH = Math.max(norm * halfPlot, 0.8);

    const bx = startX + i * (barW + barGap);
    const by = isPos ? zeroY - barH : zeroY;

    // Bar colour: green for positive, red for negative
    const barColor = isPos ? color : C.danger;
    doc.setFillColor(barColor);
    doc.roundedRect(bx, by, barW, barH, 0.6, 0.6, "F");

    // Subtle outline
    doc.setDrawColor(darkenHex(barColor, 0.15));
    doc.setLineWidth(0.15);
    const outlineY = isPos ? by : by + barH;
    doc.line(bx, outlineY, bx + barW, outlineY);

    // Value label above/below bar
    const pctText = `${isPos ? "+" : ""}${(pct * 100).toFixed(1)}%`;
    doc.setFont("helvetica", "bold").setFontSize(5.5);
    doc.setTextColor(isPos ? darkenHex(color, 0.2) : C.danger);
    const labelY = isPos ? by - 1.5 : by + barH + 4;
    doc.text(pctText, bx + barW / 2, labelY, { align: "center" });

    // Period label below chart
    doc.setFont("helvetica", "bold").setFontSize(5.5).setTextColor(C.textMedium);
    doc.text(g.period, bx + barW / 2, zeroY + halfPlot + 6, { align: "center" });

    // "from" label (smaller, below period)
    doc.setFont("helvetica", "normal").setFontSize(4.5).setTextColor(C.textLight);
    doc.text(`from ${g.prev_period}`, bx + barW / 2, zeroY + halfPlot + 10.5, { align: "center" });
  }

  return CHART_H + 2;
}

// ── Main Export ──────────────────────────────────────────────────────

export async function exportGrowthPdf(
  growth: Record<string, GrowthEntry[]>,
  labels: string[],
  stockSymbol: string,
) {
  const { jsPDF: JsPDF } = await import("jspdf");
  let doc: jsPDF | null = new JsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  try {
  const W = 210;
  const H = 297;
  const mx = PAGE_MX;
  const cw = W - mx * 2;
  const maxY = H - PAGE_FOOTER_H;
  let y = 0;
  let pageNum = 1;

  const totalMetrics = labels.length;
  const totalPeriods = Math.max(...labels.map((l) => (growth[l] ?? []).length), 0);

  // ── Page header ──────────────────────────────────────────────────
  function drawPageHeader() {
    doc.setFillColor(C.headerBg);
    doc.rect(0, 0, W, PAGE_HEADER_H, "F");
    // Accent stripe
    doc.setFillColor(C.success);
    doc.rect(0, PAGE_HEADER_H, W, 1.2, "F");

    doc.setFont("helvetica", "bold").setFontSize(15).setTextColor(C.white);
    doc.text("Growth Analysis Report", mx, 12);

    doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(C.textLight);
    doc.text(stockSymbol, mx, 20);

    drawBadge(doc, W - mx - 46, 11, `${totalMetrics} METRICS`, C.success, C.white);

    const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
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
    doc.text("Portfolio App — Growth Analysis", mx, H - 6);
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

  // ── Overview card ────────────────────────────────────────────────
  const overviewH = 22;
  ensureSpace(overviewH + 4);
  drawRoundedRect(doc, mx, y, cw, overviewH, 3, lightenHex(C.success, 0.88), C.success);

  doc.setFont("helvetica", "bold").setFontSize(10).setTextColor(C.success);
  doc.text("Overview", mx + 8, y + 7);

  doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(C.textMedium);
  const summaryLine = `${totalMetrics} Growth Metrics   |   ${totalPeriods} Period(s)   |   ${labels.join(", ")}`;
  doc.text(summaryLine, mx + 8, y + 15, { maxWidth: cw - 16 });

  y += overviewH + SECTION_GAP;

  // ── Per-metric sections ──────────────────────────────────────────
  for (let mi = 0; mi < labels.length; mi++) {
    const label = labels[mi];
    const entries = growth[label] ?? [];
    if (entries.length === 0) continue;

    const metricColor = METRIC_COLORS[mi % METRIC_COLORS.length];

    // Section header
    const sectionHeaderH = 12;
    const tableH = HEADER_ROW_H + entries.length * ROW_H + 4;
    const chartH = entries.length >= 2 ? CHART_H + 10 : 0;
    const neededMin = sectionHeaderH + tableH + 6;

    ensureSpace(Math.min(neededMin, sectionHeaderH + HEADER_ROW_H + ROW_H * 3 + 6));

    // Section header bar
    drawRoundedRect(doc, mx, y, cw, sectionHeaderH, 3, C.cardBg, C.border);
    drawRoundedRect(doc, mx, y, 3, sectionHeaderH, 1.5, metricColor);

    doc.setFillColor(metricColor);
    doc.circle(mx + 10, y + sectionHeaderH / 2, 2, "F");

    doc.setFont("helvetica", "bold").setFontSize(10).setTextColor(metricColor);
    doc.text(label, mx + 16, y + sectionHeaderH / 2 + 1);

    // Avg growth badge
    const avgGrowth = entries.reduce((s, e) => s + e.growth, 0) / entries.length;
    const avgText = `AVG ${avgGrowth >= 0 ? "+" : ""}${(avgGrowth * 100).toFixed(1)}%`;
    const avgColor = avgGrowth >= 0 ? C.success : C.danger;
    drawBadge(doc, mx + cw - 40, y + sectionHeaderH / 2, avgText, lightenHex(avgColor, 0.8), avgColor);

    y += sectionHeaderH + 4;

    // ── Growth chart ───────────────────────────────────────────────
    if (entries.length >= 2) {
      ensureSpace(CHART_H + CHART_TITLE_GAP + CHART_TABLE_GAP + 4);

      doc.setFont("helvetica", "bold").setFontSize(7.5).setTextColor(metricColor);
      doc.text(`${label} — Period-over-Period Growth`, mx + 4, y + 2);
      y += CHART_TITLE_GAP;

      const chartConsumed = drawGrowthChart(doc, mx, y, cw, entries, metricColor);
      y += chartConsumed;
      y += CHART_TABLE_GAP;
    }

    // ── Data table ─────────────────────────────────────────────────
    ensureSpace(HEADER_ROW_H + ROW_H * 2 + 8);

    // Table header
    const col1W = cw * 0.28;  // From Period
    const col2W = cw * 0.28;  // To Period
    const col3W = cw * 0.44;  // Growth %

    doc.setFillColor(C.headerBg);
    doc.roundedRect(mx, y, cw, HEADER_ROW_H, 1.5, 1.5, "F");
    doc.setFont("helvetica", "bold").setFontSize(7.5).setTextColor(C.white);
    const headerTextY = y + HEADER_ROW_H * 0.58;
    doc.text("From Period", mx + 6, headerTextY);
    doc.text("To Period", mx + col1W + 6, headerTextY);
    doc.text("Growth %", mx + col1W + col2W + col3W / 2, headerTextY, { align: "center" });
    y += HEADER_ROW_H;

    // Pre-compute max absolute growth for inline bars
    const absMaxForBars = Math.max(...entries.map((en) => Math.abs(en.growth)), 0.01);

    // Data rows — use top-of-row coordinate system
    for (let ri = 0; ri < entries.length; ri++) {
      ensureSpace(ROW_H + 2);
      const e = entries[ri];
      const rowTop = y;
      const textY = rowTop + ROW_H * 0.55;  // vertically centred text baseline

      // Alternating row background (drawn from rowTop spanning full ROW_H)
      if (ri % 2 === 0) {
        doc.setFillColor(C.altRow);
        doc.rect(mx, rowTop, cw, ROW_H, "F");
      }

      // Thin row separator at the top of each row (except first)
      if (ri > 0) {
        doc.setDrawColor(C.border);
        doc.setLineWidth(0.1);
        doc.line(mx + 2, rowTop, mx + cw - 2, rowTop);
      }

      doc.setFont("helvetica", "normal").setFontSize(7).setTextColor(C.textMedium);
      doc.text(e.prev_period, mx + 6, textY);
      doc.text(e.period, mx + col1W + 6, textY);

      // Growth value — coloured and with inline mini bar
      const pct = e.growth;
      const pctText = `${pct >= 0 ? "+" : ""}${(pct * 100).toFixed(1)}%`;
      const valColor = pct >= 0 ? C.success : C.danger;

      doc.setFont("helvetica", "bold").setFontSize(7).setTextColor(valColor);
      doc.text(pctText, mx + col1W + col2W + 6, textY);

      // Inline bar — centred vertically in row
      const barAreaX = mx + col1W + col2W + 38;
      const barAreaW = col3W - 44;
      if (barAreaW > 10) {
        const norm = Math.abs(pct) / absMaxForBars;
        const barW = norm * barAreaW;
        const barH = ROW_H * 0.45;
        const barY = rowTop + (ROW_H - barH) / 2;
        const barColor = pct >= 0 ? lightenHex(C.success, 0.5) : lightenHex(C.danger, 0.5);
        doc.setFillColor(barColor);
        doc.roundedRect(barAreaX, barY, barW, barH, 0.5, 0.5, "F");
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
    "Disclaimer: This report is for informational purposes only and does not constitute financial advice. Growth figures are computed from uploaded statements.",
    mx + 4, y + 5, { maxWidth: cw - 8 },
  );

  // ── Finalize page footers ────────────────────────────────────────
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    drawPageFooter(p, totalPages);
  }

  // ── Save / share ─────────────────────────────────────────────────
  const filename = `${stockSymbol}_growth_${todayISO()}.pdf`;

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
      await Sharing.shareAsync(file.uri, { mimeType: "application/pdf", dialogTitle: "Export Growth Report" });
    }
  }
  } finally {
    doc = null;
  }
}
