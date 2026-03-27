/**
 * Quick test script to generate a sample Growth PDF and inspect layout.
 * Run: node --experimental-specifier-resolution=node _test_growth_pdf.mjs
 */
import fs from "fs";
import { jsPDF } from "jspdf";

// ── Inline the export logic (standalone, no RN deps) ──────────────

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

const ROW_H = 7;
const HEADER_ROW_H = 8;
const SECTION_GAP = 12;
const PAGE_MX = 14;
const PAGE_HEADER_H = 28;
const PAGE_FOOTER_H = 14;
const CHART_H = 58;
const CHART_TABLE_GAP = 8;
const CHART_TITLE_GAP = 6;

function lightenHex(hex, amount = 0.85) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const lr = Math.round(r + (255 - r) * amount);
  const lg = Math.round(g + (255 - g) * amount);
  const lb = Math.round(b + (255 - b) * amount);
  return `#${lr.toString(16).padStart(2, "0")}${lg.toString(16).padStart(2, "0")}${lb.toString(16).padStart(2, "0")}`;
}

function darkenHex(hex, amount = 0.25) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const dr = Math.round(r * (1 - amount));
  const dg = Math.round(g * (1 - amount));
  const db = Math.round(b * (1 - amount));
  return `#${dr.toString(16).padStart(2, "0")}${dg.toString(16).padStart(2, "0")}${db.toString(16).padStart(2, "0")}`;
}

function drawRoundedRect(doc, x, y, w, h, r, fill, stroke) {
  doc.setFillColor(fill);
  if (stroke) {
    doc.setDrawColor(stroke);
    doc.setLineWidth(0.3);
    doc.roundedRect(x, y, w, h, r, r, "FD");
  } else {
    doc.roundedRect(x, y, w, h, r, r, "F");
  }
}

function drawBadge(doc, x, y, text, bg, fg) {
  doc.setFontSize(7);
  const tw = doc.getTextWidth(text);
  const pw = tw + 6;
  drawRoundedRect(doc, x, y - 3.5, pw, 6, 1.5, bg);
  doc.setTextColor(fg);
  doc.text(text, x + 3, y);
}

function drawGrowthChart(doc, x0, y0, w, entries, color) {
  if (entries.length === 0) return 0;
  const padTop = 12;
  const padBottom = 18;
  const padLeft = 6;
  const padRight = 6;
  const plotH = CHART_H - padTop - padBottom;
  const plotW = w - padLeft - padRight;
  const plotX = x0 + padLeft;
  const plotY = y0 + padTop;

  drawRoundedRect(doc, x0, y0, w, CHART_H, 2, C.altRow, C.border);

  const absMax = Math.max(...entries.map((e) => Math.abs(e.growth)), 0.01);
  const zeroY = plotY + plotH / 2;
  doc.setDrawColor(C.textLight);
  doc.setLineWidth(0.2);
  doc.line(plotX, zeroY, plotX + plotW, zeroY);

  doc.setFontSize(5.5).setFont("helvetica", "normal").setTextColor(C.textLight);
  doc.text("0%", plotX - 1, zeroY + 1.5, { align: "right" });

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
    const norm = Math.abs(pct) / absMax;
    const barH = Math.max(norm * halfPlot, 0.8);
    const bx = startX + i * (barW + barGap);
    const by = isPos ? zeroY - barH : zeroY;
    const barColor = isPos ? color : C.danger;
    doc.setFillColor(barColor);
    doc.roundedRect(bx, by, barW, barH, 0.6, 0.6, "F");
    doc.setDrawColor(darkenHex(barColor, 0.15));
    doc.setLineWidth(0.15);
    const outlineY = isPos ? by : by + barH;
    doc.line(bx, outlineY, bx + barW, outlineY);
    const pctText = `${isPos ? "+" : ""}${(pct * 100).toFixed(1)}%`;
    doc.setFont("helvetica", "bold").setFontSize(5.5);
    doc.setTextColor(isPos ? darkenHex(color, 0.2) : C.danger);
    const labelY = isPos ? by - 1.5 : by + barH + 4;
    doc.text(pctText, bx + barW / 2, labelY, { align: "center" });
    doc.setFont("helvetica", "bold").setFontSize(5.5).setTextColor(C.textMedium);
    doc.text(g.period, bx + barW / 2, zeroY + halfPlot + 6, { align: "center" });
    doc.setFont("helvetica", "normal").setFontSize(4.5).setTextColor(C.textLight);
    doc.text(`from ${g.prev_period}`, bx + barW / 2, zeroY + halfPlot + 10.5, { align: "center" });
  }
  return CHART_H + 2;
}

// ── Sample data ─────────────────────────────────────────────────────

const growth = {
  "Revenue Growth": [
    { prev_period: "FY2020", period: "FY2021", growth: 0.152 },
    { prev_period: "FY2021", period: "FY2022", growth: 0.078 },
    { prev_period: "FY2022", period: "FY2023", growth: -0.034 },
    { prev_period: "FY2023", period: "FY2024", growth: 0.215 },
  ],
  "Net Income Growth": [
    { prev_period: "FY2020", period: "FY2021", growth: 0.321 },
    { prev_period: "FY2021", period: "FY2022", growth: -0.156 },
    { prev_period: "FY2022", period: "FY2023", growth: 0.089 },
    { prev_period: "FY2023", period: "FY2024", growth: 0.445 },
  ],
  "EPS Growth": [
    { prev_period: "FY2020", period: "FY2021", growth: 0.287 },
    { prev_period: "FY2021", period: "FY2022", growth: -0.112 },
    { prev_period: "FY2022", period: "FY2023", growth: 0.065 },
    { prev_period: "FY2023", period: "FY2024", growth: 0.398 },
  ],
  "Total Assets Growth": [
    { prev_period: "FY2020", period: "FY2021", growth: 0.045 },
    { prev_period: "FY2021", period: "FY2022", growth: 0.123 },
    { prev_period: "FY2022", period: "FY2023", growth: -0.067 },
    { prev_period: "FY2023", period: "FY2024", growth: 0.089 },
  ],
  "Cash from Operations Growth": [
    { prev_period: "FY2020", period: "FY2021", growth: 0.189 },
    { prev_period: "FY2021", period: "FY2022", growth: 0.056 },
    { prev_period: "FY2022", period: "FY2023", growth: -0.234 },
    { prev_period: "FY2023", period: "FY2024", growth: 0.312 },
  ],
};

const labels = Object.keys(growth);

// ── Generate PDF ────────────────────────────────────────────────────

const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
const W = 210;
const H = 297;
const mx = PAGE_MX;
const cw = W - mx * 2;
const maxY = H - PAGE_FOOTER_H;
let y = 0;
let pageNum = 1;
const totalMetrics = labels.length;
const totalPeriods = Math.max(...labels.map((l) => (growth[l] ?? []).length), 0);
const stockSymbol = "AAPL";

function drawPageHeader() {
  doc.setFillColor(C.headerBg);
  doc.rect(0, 0, W, PAGE_HEADER_H, "F");
  doc.setFillColor(C.success);
  doc.rect(0, PAGE_HEADER_H, W, 1.2, "F");
  doc.setFont("helvetica", "bold").setFontSize(15).setTextColor(C.white);
  doc.text("Growth Analysis Report", mx, 12);
  doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(C.textLight);
  doc.text(stockSymbol, mx, 20);
  drawBadge(doc, W - mx - 46, 11, `${totalMetrics} METRICS`, C.success, C.white);
  doc.setFontSize(7.5).setTextColor(C.textLight);
  doc.text("Mar 24, 2026", W - mx, 21, { align: "right" });
}

function drawPageFooter(p, total) {
  doc.setPage(p);
  doc.setDrawColor(C.border);
  doc.setLineWidth(0.2);
  doc.line(mx, H - 10, mx + cw, H - 10);
  doc.setFontSize(6.5).setFont("helvetica", "normal").setTextColor(C.textLight);
  doc.text("Portfolio App — Growth Analysis", mx, H - 6);
  const label = total ? `Page ${p} of ${total}` : `Page ${p}`;
  doc.text(label, W - mx, H - 6, { align: "right" });
}

function ensureSpace(needed) {
  if (y + needed > maxY) {
    doc.addPage();
    pageNum++;
    drawPageHeader();
    y = PAGE_HEADER_H + 6;
  }
}

// Start
drawPageHeader();
y = PAGE_HEADER_H + 6;

// Overview
const overviewH = 22;
ensureSpace(overviewH + 4);
drawRoundedRect(doc, mx, y, cw, overviewH, 3, lightenHex(C.success, 0.88), C.success);
doc.setFont("helvetica", "bold").setFontSize(10).setTextColor(C.success);
doc.text("Overview", mx + 8, y + 7);
doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(C.textMedium);
const summaryLine = `${totalMetrics} Growth Metrics   |   ${totalPeriods} Period(s)   |   ${labels.join(", ")}`;
doc.text(summaryLine, mx + 8, y + 15, { maxWidth: cw - 16 });
y += overviewH + SECTION_GAP;

// Per-metric
for (let mi = 0; mi < labels.length; mi++) {
  const label = labels[mi];
  const entries = growth[label] ?? [];
  if (entries.length === 0) continue;
  const metricColor = METRIC_COLORS[mi % METRIC_COLORS.length];
  const sectionHeaderH = 12;

  ensureSpace(sectionHeaderH + HEADER_ROW_H + ROW_H * 3 + 6);

  drawRoundedRect(doc, mx, y, cw, sectionHeaderH, 3, C.cardBg, C.border);
  drawRoundedRect(doc, mx, y, 3, sectionHeaderH, 1.5, metricColor);
  doc.setFillColor(metricColor);
  doc.circle(mx + 10, y + sectionHeaderH / 2, 2, "F");
  doc.setFont("helvetica", "bold").setFontSize(10).setTextColor(metricColor);
  doc.text(label, mx + 16, y + sectionHeaderH / 2 + 1);

  const avgGrowth = entries.reduce((s, e) => s + e.growth, 0) / entries.length;
  const avgText = `AVG ${avgGrowth >= 0 ? "+" : ""}${(avgGrowth * 100).toFixed(1)}%`;
  const avgColor = avgGrowth >= 0 ? C.success : C.danger;
  drawBadge(doc, mx + cw - 40, y + sectionHeaderH / 2, avgText, lightenHex(avgColor, 0.8), avgColor);

  y += sectionHeaderH + 4;

  // Chart
  if (entries.length >= 2) {
    ensureSpace(CHART_H + CHART_TITLE_GAP + CHART_TABLE_GAP + 4);
    doc.setFont("helvetica", "bold").setFontSize(7.5).setTextColor(metricColor);
    doc.text(`${label} — Period-over-Period Growth`, mx + 4, y + 2);
    y += CHART_TITLE_GAP;
    const chartConsumed = drawGrowthChart(doc, mx, y, cw, entries, metricColor);
    y += chartConsumed;
    y += CHART_TABLE_GAP;
  }

  // Table
  ensureSpace(HEADER_ROW_H + ROW_H * 2 + 8);
  const col1W = cw * 0.28;
  const col2W = cw * 0.28;
  const col3W = cw * 0.44;

  doc.setFillColor(C.headerBg);
  doc.roundedRect(mx, y, cw, HEADER_ROW_H, 1.5, 1.5, "F");
  doc.setFont("helvetica", "bold").setFontSize(7.5).setTextColor(C.white);
  const headerTextY = y + HEADER_ROW_H * 0.58;
  doc.text("From Period", mx + 6, headerTextY);
  doc.text("To Period", mx + col1W + 6, headerTextY);
  doc.text("Growth %", mx + col1W + col2W + col3W / 2, headerTextY, { align: "center" });
  y += HEADER_ROW_H;

  const absMaxForBars = Math.max(...entries.map((en) => Math.abs(en.growth)), 0.01);

  for (let ri = 0; ri < entries.length; ri++) {
    ensureSpace(ROW_H + 2);
    const e = entries[ri];
    const rowTop = y;
    const textY = rowTop + ROW_H * 0.55;

    if (ri % 2 === 0) {
      doc.setFillColor(C.altRow);
      doc.rect(mx, rowTop, cw, ROW_H, "F");
    }

    if (ri > 0) {
      doc.setDrawColor(C.border);
      doc.setLineWidth(0.1);
      doc.line(mx + 2, rowTop, mx + cw - 2, rowTop);
    }

    doc.setFont("helvetica", "normal").setFontSize(7).setTextColor(C.textMedium);
    doc.text(e.prev_period, mx + 6, textY);
    doc.text(e.period, mx + col1W + 6, textY);

    const pct = e.growth;
    const pctText = `${pct >= 0 ? "+" : ""}${(pct * 100).toFixed(1)}%`;
    const valColor = pct >= 0 ? C.success : C.danger;
    doc.setFont("helvetica", "bold").setFontSize(7).setTextColor(valColor);
    doc.text(pctText, mx + col1W + col2W + 6, textY);

    const barAreaX = mx + col1W + col2W + 38;
    const barAreaW = col3W - 44;
    if (barAreaW > 10) {
      const norm = Math.abs(pct) / absMaxForBars;
      const bW = norm * barAreaW;
      const barH = ROW_H * 0.45;
      const barY = rowTop + (ROW_H - barH) / 2;
      const barColor = pct >= 0 ? lightenHex(C.success, 0.5) : lightenHex(C.danger, 0.5);
      doc.setFillColor(barColor);
      doc.roundedRect(barAreaX, barY, bW, barH, 0.5, 0.5, "F");
    }
    y += ROW_H;
  }

  doc.setDrawColor(C.border);
  doc.setLineWidth(0.3);
  doc.line(mx, y, mx + cw, y);
  y += SECTION_GAP;
}

// Disclaimer
ensureSpace(16);
drawRoundedRect(doc, mx, y, cw, 14, 2, C.altRow, C.border);
doc.setFontSize(6.5).setFont("helvetica", "italic").setTextColor(C.muted);
doc.text(
  "Disclaimer: This report is for informational purposes only and does not constitute financial advice.",
  mx + 4, y + 5, { maxWidth: cw - 8 },
);

const totalPages = doc.getNumberOfPages();
for (let p = 1; p <= totalPages; p++) drawPageFooter(p, totalPages);

const buf = doc.output("arraybuffer");
fs.writeFileSync("_test_growth_AFTER.pdf", Buffer.from(buf));
console.log("✅ Wrote _test_growth_AFTER.pdf");
