/**
 * exportValuationPdf — Generate a modern, analyst-style PDF report
 * for all valuation models: Summary → Graham → DCF → DDM → Multiples.
 *
 * Uses jsPDF (Helvetica built-in). Works cross-platform.
 */

import { todayISO } from "@/lib/dateUtils";
import { sanitizePdfText } from "@/lib/sanitizePdf";
import { Platform } from "react-native";

type jsPDF = import("jspdf").jsPDF;

// ── Types ────────────────────────────────────────────────────────────

export interface ValuationEntry {
  model_type: string;
  intrinsic_value: number | null;
  valuation_date: string;
  parameters: Record<string, unknown>;
  assumptions?: Record<string, unknown>;
}

export interface ValuationSummaryData {
  stockSymbol: string;
  currentPrice: number | null;
  marginOfSafety: number;
  models: Record<string, { iv: number; date: string }>;
  avgIV: number | null;
  avgBuyBelow: number | null;
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
  warning: "#D97706",
  warningLight: "#FEF3C7",
  muted: "#64748B",
  border: "#E2E8F0",
  textDark: "#1E293B",
  textMedium: "#475569",
  textLight: "#94A3B8",
  white: "#FFFFFF",
  altRow: "#F8FAFC",
  graham: "#f59e0b",
  dcf: "#6366f1",
  ddm: "#10b981",
  multiples: "#ec4899",
};

const MODEL_COLORS: Record<string, string> = {
  graham: C.graham,
  dcf: C.dcf,
  ddm: C.ddm,
  multiples: C.multiples,
};

const MODEL_LABELS: Record<string, string> = {
  graham: "Graham Growth Formula",
  dcf: "Discounted Cash Flow (DCF)",
  ddm: "Dividend Discount Model (DDM)",
  multiples: "Peer Multiples",
};

/** Map model accent hex → light tint for backgrounds (jsPDF has no alpha support) */
const _LIGHT: Record<string, string> = {
  "#f59e0b": "#FEF3C7", "#6366f1": "#EEF2FF", "#10b981": "#D1FAE5",
  "#ec4899": "#FCE7F3", "#6366F1": "#EEF2FF",
};
function lightTint(color: string): string {
  return _LIGHT[color] ?? _LIGHT[color.toLowerCase()] ?? "#F1F5F9";
}

// ── Constants ────────────────────────────────────────────────────────

const ROW_H = 7;
const PAGE_MX = 16;
const PAGE_HEADER_H = 28;
const PAGE_FOOTER_H = 14;

// ── Drawing helpers ──────────────────────────────────────────────────

function drawRoundedRect(doc: jsPDF, x: number, y: number, w: number, h: number, r: number, fill: string, stroke?: string) {
  doc.setFillColor(fill);
  if (stroke) {
    doc.setDrawColor(stroke);
    doc.setLineWidth(0.4);
    doc.roundedRect(x, y, w, h, r, r, "FD");
  } else {
    doc.roundedRect(x, y, w, h, r, r, "F");
  }
}

function drawBadge(doc: jsPDF, x: number, y: number, text: string, bg: string, fg: string) {
  doc.setFontSize(7.5);
  const tw = doc.getTextWidth(text);
  const pw = tw + 8;
  drawRoundedRect(doc, x, y - 4, pw, 7, 2, bg);
  doc.setTextColor(fg);
  doc.text(text, x + 4, y);
}

function fmtN(v: number | null | undefined): string {
  if (v == null) return "—";
  return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtBig(v: number | null | undefined): string {
  if (v == null) return "—";
  const abs = Math.abs(v);
  if (abs >= 1_000_000_000) return (v / 1_000_000_000).toFixed(2) + "B";
  if (abs >= 1_000_000) return (v / 1_000_000).toFixed(2) + "M";
  if (abs >= 10_000) return (v / 1_000).toFixed(1) + "K";
  return v.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function fmtPct(v: number | null | undefined): string {
  if (v == null) return "—";
  return (v * 100).toFixed(2) + "%";
}

function kvRow(doc: jsPDF, x: number, y: number, label: string, value: string, w: number, bold = false) {
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal").setTextColor(C.textMedium);
  doc.text(sanitizePdfText(label, 80), x, y);
  doc.setFont("helvetica", bold ? "bold" : "normal").setTextColor(C.textDark);
  doc.text(sanitizePdfText(value, 80), x + w, y, { align: "right" });
}

// ── DCF-specific parameter formatting ────────────────────────────

const _PCT_KEYS = new Set(["growth_stage1", "growth_stage2", "discount_rate", "terminal_growth", "growth_rate", "required_return"]);
const _BIG_KEYS = new Set(["fcf", "shares_outstanding", "cash", "debt"]);
const _INT_KEYS = new Set(["stage1_years", "stage2_years"]);
const _PARAM_LABELS: Record<string, string> = {
  growth_stage1: "Stage 1 Growth", growth_stage2: "Stage 2 Growth",
  discount_rate: "Discount Rate", terminal_growth: "Perpetual Growth",
  stage1_years: "Stage 1 Years", stage2_years: "Stage 2 Years",
  shares_outstanding: "Shares Outstanding", growth_rate: "Growth Rate",
  required_return: "Required Return", last_dividend: "Last Dividend",
  corporate_yield: "Corp Bond Yield", margin_of_safety: "Margin of Safety",
  current_price: "Current Price", metric_value: "Metric Value",
  peer_multiple: "Peer Multiple", multiple_type: "Multiple Type",
  eps: "EPS", fcf: "Free Cash Flow", cash: "Cash", debt: "Total Debt",
};

function paramLabel(key: string): string {
  return _PARAM_LABELS[key] ?? key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function fmtParamValue(model: string, key: string, val: unknown): string {
  if (val == null) return "—";
  if (typeof val !== "number") return sanitizePdfText(val, 100);
  if (_PCT_KEYS.has(key)) return (val * 100).toFixed(2) + "%";
  if (_BIG_KEYS.has(key)) return fmtBig(val);
  if (_INT_KEYS.has(key)) return String(Math.round(val));
  return fmtN(val);
}

// ── Main Export ──────────────────────────────────────────────────────

export async function exportValuationPdf(
  summary: ValuationSummaryData,
  valuations: ValuationEntry[],
) {
  const { jsPDF: JsPDF } = await import("jspdf");
  const doc: jsPDF = new JsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
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
    doc.rect(0, PAGE_HEADER_H, W, 1.5, "F");

    doc.setFont("helvetica", "bold").setFontSize(17).setTextColor(C.white);
    doc.text(sanitizePdfText(summary.stockSymbol, 20), mx, 14);

    doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(C.textLight);
    doc.text("Valuation Analysis Report", mx, 22);

    const modelCount = Object.keys(summary.models).length;
    drawBadge(doc, W - mx - 50, 12, `${modelCount} MODEL${modelCount !== 1 ? "S" : ""}`, C.primary, C.white);

    const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
    doc.setFontSize(7.5).setTextColor(C.textLight);
    doc.text(today, W - mx, 22, { align: "right" });
  }

  // ── Page footer ──────────────────────────────────────────────────
  function drawPageFooter(p: number, total?: number) {
    doc.setPage(p);
    doc.setDrawColor(C.border);
    doc.setLineWidth(0.2);
    doc.line(mx, H - 10, mx + cw, H - 10);
    doc.setFontSize(6.5).setFont("helvetica", "normal").setTextColor(C.textLight);
    doc.text("Portfolio App — Fundamental Analysis", mx, H - 6);
    const label = total ? `Page ${p} of ${total}` : `Page ${p}`;
    doc.text(label, W - mx, H - 6, { align: "right" });
  }

  function ensureSpace(needed: number) {
    if (y + needed > maxY) {
      doc.addPage();
      pageNum++;
      drawPageHeader();
      y = PAGE_HEADER_H + 10;
    }
  }

  function sectionHeader(title: string, color: string) {
    ensureSpace(60);
    // Separator rule above section (skip near page top)
    if (y > PAGE_HEADER_H + 16) {
      doc.setDrawColor(C.border);
      doc.setLineWidth(0.4);
      doc.line(mx, y, mx + cw, y);
      y += 10;
    }
    // Full-width heading bar: light tinted background + left accent strip
    const barH = 14;
    drawRoundedRect(doc, mx, y, cw, barH, 3, lightTint(color));
    doc.setFillColor(color);
    doc.rect(mx + 0.5, y + 1.5, 3, barH - 3, "F");
    doc.setFont("helvetica", "bold").setFontSize(13).setTextColor(color);
    doc.text(sanitizePdfText(title, 60), mx + 10, y + 9.5);
    y += barH + 6;
  }

  function separator() {
    doc.setDrawColor(C.border);
    doc.setLineWidth(0.2);
    doc.line(mx, y, mx + cw, y);
    y += 4;
  }

  // ── Draw first page ──────────────────────────────────────────────
  drawPageHeader();
  y = PAGE_HEADER_H + 10;

  // ═══════════════════════════════════════════════════════════════════
  // SECTION 1: VALUATION SUMMARY
  // ═══════════════════════════════════════════════════════════════════
  const summaryModels = Object.keys(summary.models);
  if (summaryModels.length > 0) {
    sectionHeader("Valuation Summary", C.primary);

    // Summary card background
    const hasVerdict = summary.currentPrice != null && summary.currentPrice > 0 && summary.avgIV != null;
    const cardH = 34 + summaryModels.length * ROW_H + (hasVerdict ? 30 : 0);
    ensureSpace(cardH);
    const summaryCardTop = y;
    drawRoundedRect(doc, mx, y, cw, cardH, 3, C.white, C.border);
    const cardX = mx + 8;
    const cardW = cw - 16;
    y += 6;

    // Table header
    doc.setFontSize(8).setFont("helvetica", "bold").setTextColor(C.muted);
    doc.text("MODEL", cardX, y);
    doc.text("INTRINSIC VALUE", cardX + cardW - 60, y, { align: "right" });
    doc.text("BUY BELOW", cardX + cardW, y, { align: "right" });
    y += 2;
    doc.setDrawColor(C.border);
    doc.setLineWidth(0.15);
    doc.line(cardX, y, cardX + cardW, y);
    y += 4;

    // Per-model rows
    for (const m of summaryModels) {
      const { iv } = summary.models[m];
      const buyBelow = iv * (1 - summary.marginOfSafety / 100);
      const mColor = MODEL_COLORS[m] ?? C.primary;

      // Model dot + name
      doc.setFillColor(mColor);
      doc.circle(cardX + 2, y - 1.5, 1.5, "F");
      doc.setFontSize(9).setFont("helvetica", "bold").setTextColor(C.textDark);
      doc.text(sanitizePdfText(m.toUpperCase(), 40), cardX + 7, y);

      // Values
      doc.setFont("helvetica", "bold").setTextColor(C.textDark);
      doc.text(fmtN(iv), cardX + cardW - 60, y, { align: "right" });
      doc.setTextColor(C.success);
      doc.text(fmtN(buyBelow), cardX + cardW, y, { align: "right" });
      y += ROW_H;
    }

    separator();

    // Average row
    doc.setFontSize(10).setFont("helvetica", "bold").setTextColor(C.textDark);
    doc.text("Average", cardX, y);
    doc.setTextColor(C.primary);
    doc.text(fmtN(summary.avgIV), cardX + cardW - 60, y, { align: "right" });
    doc.setTextColor(C.success);
    doc.text(fmtN(summary.avgBuyBelow), cardX + cardW, y, { align: "right" });
    y += 4;

    // MoS badge
    drawBadge(doc, cardX, y, `MARGIN OF SAFETY: ${summary.marginOfSafety}%`, C.primaryLight, C.primary);
    y += 10;

    // ── Overvalued / Undervalued verdict ──────────────────────────
    if (summary.currentPrice != null && summary.currentPrice > 0 && summary.avgIV != null) {
      const cp = summary.currentPrice;
      const diff = ((summary.avgIV - cp) / cp) * 100;
      const isUnder = diff > 0;
      const buyOk = summary.avgBuyBelow != null && cp <= summary.avgBuyBelow;

      // Current price row
      kvRow(doc, cardX, y, "Current Price", fmtN(cp), cardW);
      y += ROW_H;
      kvRow(doc, cardX, y, "Upside / Downside", `${isUnder ? "+" : ""}${diff.toFixed(2)}%`, cardW);
      y += ROW_H + 2;

      // Verdict badge
      const verdictBg = isUnder ? C.successLight : C.dangerLight;
      const verdictColor = isUnder ? C.success : C.danger;
      const verdictText = isUnder ? "UNDERVALUED" : "OVERVALUED";
      drawRoundedRect(doc, cardX, y - 4, cardW, 12, 3, verdictBg);
      doc.setFont("helvetica", "bold").setFontSize(11).setTextColor(verdictColor);
      doc.text(verdictText, cardX + 8, y + 3);

      if (buyOk) {
        drawBadge(doc, cardX + cardW - 60, y + 1, "BELOW BUY PRICE", C.successLight, C.success);
      }

      doc.setFontSize(9).setTextColor(verdictColor);
      doc.text(`${isUnder ? "+" : ""}${diff.toFixed(2)}%`, cardX + 52, y + 3);
      y += 14;
    }

    y = summaryCardTop + cardH + 6;
  }

  // ═══════════════════════════════════════════════════════════════════
  // SECTION 2+: INDIVIDUAL MODEL RESULTS (full analysis detail)
  // ═══════════════════════════════════════════════════════════════════

  // Get latest valuation per model
  const latestPerModel: Record<string, ValuationEntry> = {};
  for (const v of valuations) {
    if (v.intrinsic_value != null && !latestPerModel[v.model_type]) {
      latestPerModel[v.model_type] = v;
    }
  }

  /** Reusable: draw the Intrinsic Value highlight bar */
  function drawIVBar(label: string, iv: number | null, color: string) {
    ensureSpace(24);
    const barH = 18;
    drawRoundedRect(doc, mx, y, cw, barH, 3, lightTint(color));
    doc.setFillColor(color);
    doc.rect(mx + 0.5, y + 2, 3, barH - 4, "F");
    doc.setFont("helvetica", "bold").setFontSize(10).setTextColor(C.textDark);
    doc.text(label, mx + 10, y + 8);
    doc.setFontSize(18).setTextColor(color);
    doc.text(fmtN(iv), mx + cw - 8, y + 9.5, { align: "right" });
    y += barH + 4;
  }

  /** Reusable: current price + verdict badge (unified for all models) */
  function drawPriceVerdict(iv: number, cp: number | null) {
    if (cp == null || cp <= 0) return;
    ensureSpace(26);
    const diff = ((iv - cp) / cp) * 100;
    const isUnder = diff > 0;
    kvRow(doc, mx + 8, y, "Current Price", fmtN(cp), cw - 16, true);
    y += ROW_H;
    const verdictColor = isUnder ? C.success : C.danger;
    const verdictBg = isUnder ? C.successLight : C.dangerLight;
    const verdictLabel = isUnder ? "Undervalued" : "Overvalued";
    drawRoundedRect(doc, mx, y - 3, cw, 10, 3, verdictBg);
    doc.setFontSize(9).setFont("helvetica", "bold").setTextColor(verdictColor);
    doc.text(verdictLabel, mx + 8, y + 3);
    doc.text(`${isUnder ? "+" : ""}${diff.toFixed(2)}%`, mx + cw - 8, y + 3, { align: "right" });
    y += 14;
  }

  /** Reusable: draw MoS + buy price strip */
  function drawMosBuyPrice(iv: number, mos: number) {
    ensureSpace(14);
    const buyPrice = iv * (1 - mos / 100);
    drawRoundedRect(doc, mx, y, cw, 10, 3, C.altRow, C.border);
    doc.setFontSize(8).setFont("helvetica", "normal").setTextColor(C.muted);
    doc.text(`Margin of Safety: ${mos}%`, mx + 8, y + 5.5);
    doc.setFont("helvetica", "bold").setTextColor(C.success);
    doc.text(`Acceptable Buy Price: ${fmtN(buyPrice)}`, mx + cw - 8, y + 5.5, { align: "right" });
    y += 14;
  }

  /** Reusable: method / formula info card */
  function drawFormulaBox(lines: string[]) {
    if (lines.length === 0) return;
    const h = 6 + lines.length * 5 + 2;
    ensureSpace(h + 2);
    drawRoundedRect(doc, mx, y, cw, h, 3, C.altRow, C.border);
    let ly = y + 5;
    doc.setFontSize(7.5).setFont("helvetica", "italic").setTextColor(C.muted);
    for (const line of lines) {
      doc.text(sanitizePdfText(line, 200), mx + 8, ly);
      ly += 5;
    }
    y += h + 2;
  }

  const modelOrder = ["graham", "dcf", "ddm", "multiples"];
  for (const m of modelOrder) {
    const entry = latestPerModel[m];
    if (!entry) continue;

    const mColor = MODEL_COLORS[m] ?? C.primary;
    const mLabel = MODEL_LABELS[m] ?? m.toUpperCase();
    const params = entry.parameters ?? {};
    const a = (entry.assumptions ?? {}) as Record<string, unknown>;

    sectionHeader(mLabel, mColor);

    // Date
    doc.setFontSize(8).setFont("helvetica", "normal").setTextColor(C.textLight);
    doc.text(`Calculated: ${sanitizePdfText(entry.valuation_date, 40)}`, mx, y);
    y += 6;

    // ═════════════════════════════════════════════════════════════
    // GRAHAM — Full analysis detail
    // ═════════════════════════════════════════════════════════════
    if (m === "graham") {
      // Formula card
      const formulaOrig = a.formula_original as string | undefined;
      const formulaRev = a.formula_revised as string | undefined;
      { const fl: string[] = [];
        if (formulaOrig) fl.push(`Original: ${formulaOrig}`);
        if (formulaRev) fl.push(`Revised:  ${formulaRev}`);
        drawFormulaBox(fl);
      }

      // Input parameters card
      const gRate = typeof params.growth_rate === "number" ? params.growth_rate as number : null;
      const inputItems: [string, string][] = [
        ["EPS (TTM)", fmtN(params.eps as number | null)],
        ["Growth Rate (g)", gRate != null ? `${gRate.toFixed(1)}%` : "—"],
        ["AAA Bond Yield (Y)", typeof params.aaa_yield === "number" ? `${(params.aaa_yield as number).toFixed(2)}%` : "—"],
      ];
      const inputH = 11 + inputItems.length * ROW_H + 4;
      ensureSpace(inputH);
      drawRoundedRect(doc, mx, y, cw, inputH, 3, C.white, C.border);
      y += 6;
      doc.setFontSize(8).setFont("helvetica", "bold").setTextColor(C.muted);
      doc.text("INPUT PARAMETERS", mx + 8, y);
      y += 5;
      for (const [label, value] of inputItems) { kvRow(doc, mx + 8, y, label, value, cw - 16); y += ROW_H; }
      y += 4;

      // Calculation results — original vs revised
      const ivOrig = params.iv_original as number | null | undefined;
      const ivRev = params.iv_revised as number | null | undefined;
      const g = gRate ?? 0;
      const basePeOrig = (a.base_pe_original as number) ?? 8.5;
      const basePeRev = (a.base_pe_revised as number) ?? 7;
      const peOrig = basePeOrig + 2 * g;
      const peRev = basePeRev + 1 * g;

      const calcItems: [string, string][] = [
        [`P/E Original (${basePeOrig} + 2g)`, peOrig.toFixed(1)],
        ["IV Original", fmtN(ivOrig as number | null)],
        [`P/E Revised (${basePeRev} + 1g)`, peRev.toFixed(1)],
        ["IV Revised", fmtN(ivRev as number | null)],
      ];
      const calcH = 11 + calcItems.length * ROW_H + 4;
      ensureSpace(calcH);
      drawRoundedRect(doc, mx, y, cw, calcH, 3, C.white, C.border);
      y += 6;
      doc.setFontSize(8).setFont("helvetica", "bold").setTextColor(C.muted);
      doc.text("CALCULATION RESULTS", mx + 8, y);
      y += 5;
      for (const [label, value] of calcItems) { kvRow(doc, mx + 8, y, label, value, cw - 16); y += ROW_H; }
      y += 4;

      // Intrinsic Value (Revised) highlight
      drawIVBar("Intrinsic Value (Revised)", entry.intrinsic_value, mColor);

      // Current Price + Verdict
      if (entry.intrinsic_value != null) drawPriceVerdict(entry.intrinsic_value, (params.price as number | null) ?? summary.currentPrice);

      // MoS + buy price
      const mosPct = typeof params.margin_of_safety === "number" ? (params.margin_of_safety as number) : summary.marginOfSafety;
      if (entry.intrinsic_value != null) drawMosBuyPrice(entry.intrinsic_value, mosPct);
    }

    // ═════════════════════════════════════════════════════════════
    // DCF — Full analysis detail
    // ═════════════════════════════════════════════════════════════
    if (m === "dcf") {
      // ── 1. FCF Projections table (matches UI: shown FIRST) ───
      const projections = (a.projections ?? []) as Array<{ year: number; stage: number; fcf: number; pv: number }>;
      if (projections.length > 0) {
        const tableH = 10 + 3 * 7 + 4;
        ensureSpace(tableH);
        drawRoundedRect(doc, mx, y, cw, tableH, 3, C.white, C.border);
        y += 6;
        doc.setFontSize(8).setFont("helvetica", "bold").setTextColor(C.muted);
        doc.text("CASH FLOW PROJECTIONS", mx + 8, y);
        y += 5;

        const baseYear = new Date().getFullYear();
        const nCols = Math.min(projections.length, 10);
        const labelW = 30;
        const tvW = 22;
        const colW = (cw - 16 - labelW - tvW) / nCols;
        const startX = mx + 8 + labelW;

        doc.setFontSize(6.5).setFont("helvetica", "bold").setTextColor(C.muted);
        doc.text("Year", mx + 8, y);
        for (let i = 0; i < nCols; i++) {
          const p = projections[i];
          doc.setTextColor(p.stage === 1 ? C.dcf : C.success);
          doc.text(String(baseYear + p.year - 1), startX + i * colW + colW / 2, y, { align: "center" });
        }
        doc.setTextColor(C.muted);
        doc.text("TV", startX + nCols * colW + tvW / 2, y, { align: "center" });
        y += 6;

        doc.setFontSize(6.5).setFont("helvetica", "normal").setTextColor(C.textMedium);
        doc.text("FCF", mx + 8, y);
        doc.setTextColor(C.textDark);
        for (let i = 0; i < nCols; i++) {
          doc.text(fmtBig(projections[i].fcf), startX + i * colW + colW / 2, y, { align: "center" });
        }
        const tv = a.terminal_value;
        doc.setFont("helvetica", "bold");
        doc.text(typeof tv === "number" ? fmtBig(tv) : "—", startX + nCols * colW + tvW / 2, y, { align: "center" });
        y += 6;

        doc.setFont("helvetica", "normal").setTextColor(C.textMedium);
        doc.text("PV", mx + 8, y);
        doc.setTextColor(C.textDark);
        for (let i = 0; i < nCols; i++) {
          doc.text(fmtBig(projections[i].pv), startX + i * colW + colW / 2, y, { align: "center" });
        }
        const pvTV = a.pv_terminal;
        doc.setFont("helvetica", "bold");
        doc.text(typeof pvTV === "number" ? fmtBig(pvTV) : "—", startX + nCols * colW + tvW / 2, y, { align: "center" });
        y += 8;
      }

      // ── 2. Equity Bridge Summary (matches UI: shown SECOND) ──
      const eqItems: [string, string, boolean][] = [
        ["Sum of PV (FCF)", typeof a.pv_fcfs === "number" ? fmtBig(a.pv_fcfs as number) : "—", false],
        ["Cash & Equivalents", typeof a.cash === "number" ? fmtBig(a.cash as number) : fmtBig(params.cash as number | null), false],
        ["Total Debt", typeof a.debt === "number" ? fmtBig(a.debt as number) : fmtBig(params.debt as number | null), false],
        ["Equity Value", typeof a.equity_value === "number" ? fmtBig(a.equity_value as number) : "—", true],
        ["Shares Outstanding", fmtBig(params.shares_outstanding as number | null), false],
      ];
      const eqH = 11 + eqItems.length * ROW_H + 4;
      ensureSpace(eqH);
      drawRoundedRect(doc, mx, y, cw, eqH, 3, C.altRow, C.border);
      y += 6;
      doc.setFontSize(8).setFont("helvetica", "bold").setTextColor(C.muted);
      doc.text("EQUITY BRIDGE", mx + 8, y);
      y += 5;
      for (const [label, value, bold] of eqItems) { kvRow(doc, mx + 8, y, label, value, cw - 16, bold); y += ROW_H; }
      y += 4;

      // ── 3. Assumptions card (matches UI: shown THIRD) ─────────
      const dcfAssumptions: [string, string][] = [
        ["Base FCF", fmtBig(params.fcf as number | null)],
        ["Stage 1 Growth", typeof params.growth_stage1 === "number" ? fmtPct(params.growth_stage1 as number) : "—"],
        ["Stage 2 Growth", typeof params.growth_stage2 === "number" ? fmtPct(params.growth_stage2 as number) : "—"],
        ["Discount Rate", typeof params.discount_rate === "number" ? fmtPct(params.discount_rate as number) : "—"],
        ["Perpetual Growth", typeof params.terminal_growth === "number" ? fmtPct(params.terminal_growth as number) : "—"],
        ["Stage 1 Years", params.stage1_years != null ? String(Math.round(params.stage1_years as number)) : "5"],
        ["Stage 2 Years", params.stage2_years != null ? String(Math.round(params.stage2_years as number)) : "5"],
        ["Shares Outstanding", fmtBig(params.shares_outstanding as number | null)],
      ];
      const assumH = 11 + dcfAssumptions.length * ROW_H + 4;
      ensureSpace(assumH);
      drawRoundedRect(doc, mx, y, cw, assumH, 3, C.white, C.border);
      y += 6;
      doc.setFontSize(8).setFont("helvetica", "bold").setTextColor(C.muted);
      doc.text("ASSUMPTIONS", mx + 8, y);
      y += 5;
      for (const [label, value] of dcfAssumptions) { kvRow(doc, mx + 8, y, label, value, cw - 16); y += ROW_H; }
      y += 4;

      // WACC breakdown (inside assumptions, matches UI)
      const wacc = params.wacc as Record<string, number> | undefined;
      if (wacc) {
        const waccH = 78;
        ensureSpace(waccH);
        drawRoundedRect(doc, mx, y, cw, waccH, 3, C.primaryLight, "#A5B4FC");
        y += 6;
        doc.setFontSize(8).setFont("helvetica", "bold").setTextColor(C.primary);
        doc.text("WACC BREAKDOWN", mx + 8, y);
        doc.setFontSize(7).setFont("helvetica", "italic").setTextColor(C.textMedium);
        doc.text("WACC = (E/V x Ke) + (D/V x Kd x (1 - T))", mx + 50, y);
        y += 6;
        const waccItems: [string, string][] = [
          ["Risk-Free Rate (Rf)", wacc.risk_free_rate != null ? fmtPct(wacc.risk_free_rate) : "—"],
          ["Beta", wacc.beta != null ? wacc.beta.toFixed(2) : "—"],
          ["Equity Risk Premium", wacc.equity_risk_premium != null ? fmtPct(wacc.equity_risk_premium) : "—"],
          ["Cost of Equity (Ke)", wacc.cost_of_equity != null ? fmtPct(wacc.cost_of_equity) : "—"],
          ["Cost of Debt (Kd)", wacc.cost_of_debt != null ? fmtPct(wacc.cost_of_debt) : "—"],
          ["Tax Rate (T)", wacc.tax_rate != null ? fmtPct(wacc.tax_rate) : "—"],
          ["Equity Weight (E/V)", wacc.weight_equity != null ? fmtPct(wacc.weight_equity) : "—"],
          ["Debt Weight (D/V)", wacc.weight_debt != null ? fmtPct(wacc.weight_debt) : "—"],
        ];
        for (const [label, value] of waccItems) { kvRow(doc, mx + 8, y, label, value, cw - 16); y += ROW_H; }
        doc.setDrawColor("#818CF8");
        doc.setLineWidth(0.3);
        doc.line(mx + 8, y - 1, mx + cw - 8, y - 1);
        y += 2;
        doc.setFontSize(10).setFont("helvetica", "bold").setTextColor(C.primary);
        doc.text("WACC", mx + 8, y);
        const waccVal = wacc.weight_equity != null && wacc.cost_of_equity != null
          ? wacc.weight_equity * wacc.cost_of_equity + (wacc.weight_debt ?? 0) * (wacc.cost_of_debt ?? 0) * (1 - (wacc.tax_rate ?? 0))
          : null;
        doc.text(waccVal != null ? fmtPct(waccVal) : "—", mx + cw - 8, y, { align: "right" });
        y += 8;
      }

      // ── 4. DCF Price per Share highlight ──────────────────────
      drawIVBar("DCF Price per Share", entry.intrinsic_value, mColor);

      // ── 5. Current Price + Verdict ────────────────────────────
      if (entry.intrinsic_value != null) drawPriceVerdict(entry.intrinsic_value, summary.currentPrice);

      // ── 6. TV % warning ───────────────────────────────────────
      const tvPct = a.tv_pct_of_ev;
      if (typeof tvPct === "number") {
        ensureSpace(10);
        const tvColor = tvPct > 75 ? C.warning : C.muted;
        doc.setFontSize(8).setFont("helvetica", "normal").setTextColor(tvColor);
        doc.text(`Terminal Value = ${tvPct.toFixed(1)}% of Enterprise Value${tvPct > 75 ? "  (>75% — warrants caution)" : ""}`, mx, y);
        y += 8;
      }

      // ── 7. MoS + buy price ────────────────────────────────────
      if (entry.intrinsic_value != null) drawMosBuyPrice(entry.intrinsic_value, summary.marginOfSafety);
    }

    // ═════════════════════════════════════════════════════════════
    // DDM — Full analysis detail
    // ═════════════════════════════════════════════════════════════
    if (m === "ddm") {
      // Method + formula card
      { const method = a.method as string | undefined;
        const formula = a.formula as string | undefined;
        const fl: string[] = [];
        if (method) fl.push(`Method: ${method}`);
        if (formula) fl.push(`Formula: ${formula}`);
        drawFormulaBox(fl);
      }

      // Input parameters
      const ddmParams: [string, string][] = [
        ["Last Dividend", fmtN(params.last_dividend as number | null)],
        ["Growth Rate (g)", typeof params.growth_rate === "number" ? fmtPct(params.growth_rate as number) : "—"],
        ["Required Return (r)", typeof params.required_return === "number" ? fmtPct(params.required_return as number) : "—"],
      ];
      if (params.high_growth_years != null) ddmParams.push(["High-Growth Years", String(Math.round(params.high_growth_years as number))]);
      if (params.high_growth_rate != null) ddmParams.push(["High-Growth Rate", typeof params.high_growth_rate === "number" ? fmtPct(params.high_growth_rate as number) : "—"]);
      const ddmH = 11 + ddmParams.length * ROW_H + 4;
      ensureSpace(ddmH);
      drawRoundedRect(doc, mx, y, cw, ddmH, 3, C.white, C.border);
      y += 6;
      doc.setFontSize(8).setFont("helvetica", "bold").setTextColor(C.muted);
      doc.text("INPUT PARAMETERS", mx + 8, y);
      y += 5;
      for (const [label, value] of ddmParams) { kvRow(doc, mx + 8, y, label, value, cw - 16); y += ROW_H; }
      y += 4;

      // D1 and Spread
      const d1 = a.d1 as number | undefined;
      const spread = a.spread as number | undefined;
      if (d1 != null || spread != null) {
        const derivedItems: [string, string][] = [];
        if (d1 != null) derivedItems.push(["D1 (Next Dividend)", d1.toFixed(4)]);
        if (spread != null) derivedItems.push(["Spread (r - g)", fmtPct(spread)]);
        const dH = 11 + derivedItems.length * ROW_H + 4;
        ensureSpace(dH);
        drawRoundedRect(doc, mx, y, cw, dH, 3, C.altRow, C.border);
        y += 6;
        doc.setFontSize(8).setFont("helvetica", "bold").setTextColor(C.muted);
        doc.text("DERIVED VALUES", mx + 8, y);
        y += 5;
        for (const [label, value] of derivedItems) { kvRow(doc, mx + 8, y, label, value, cw - 16); y += ROW_H; }
        y += 4;
      }

      // Dividend Projections table (two-stage)
      const ddmProj = (a.projections ?? []) as Array<{ year: number; dividend: number; pv: number }>;
      if (ddmProj.length > 0) {
        const tableH = 10 + 3 * 7 + 4;
        ensureSpace(tableH);
        drawRoundedRect(doc, mx, y, cw, tableH, 3, C.white, C.border);
        y += 6;
        doc.setFontSize(8).setFont("helvetica", "bold").setTextColor(C.muted);
        doc.text("HIGH-GROWTH STAGE DIVIDENDS", mx + 8, y);
        y += 5;

        const nCols = Math.min(ddmProj.length, 10);
        const labelW = 30;
        const colW = (cw - 16 - labelW) / nCols;
        const startX = mx + 8 + labelW;

        doc.setFontSize(6.5).setFont("helvetica", "bold").setTextColor(C.muted);
        doc.text("Year", mx + 8, y);
        for (let i = 0; i < nCols; i++) { doc.setTextColor(C.ddm); doc.text(String(ddmProj[i].year), startX + i * colW + colW / 2, y, { align: "center" }); }
        y += 6;

        doc.setFontSize(6.5).setFont("helvetica", "normal").setTextColor(C.textMedium);
        doc.text("Div", mx + 8, y);
        doc.setTextColor(C.textDark);
        for (let i = 0; i < nCols; i++) { doc.text(fmtN(ddmProj[i].dividend), startX + i * colW + colW / 2, y, { align: "center" }); }
        y += 6;

        doc.setFont("helvetica", "normal").setTextColor(C.textMedium);
        doc.text("PV", mx + 8, y);
        doc.setTextColor(C.textDark);
        for (let i = 0; i < nCols; i++) { doc.text(fmtN(ddmProj[i].pv), startX + i * colW + colW / 2, y, { align: "center" }); }
        y += 8;
      }

      // PV Summary
      const pvDiv = a.pv_dividends as number | undefined;
      const pvTerm = a.pv_terminal as number | undefined;
      if (pvDiv != null || pvTerm != null) {
        const pvItems: [string, string][] = [];
        if (pvDiv != null) pvItems.push(["Sum of PV (Dividends)", fmtN(pvDiv)]);
        if (pvTerm != null) pvItems.push(["PV of Terminal Value", fmtN(pvTerm)]);
        const pvH = 11 + pvItems.length * ROW_H + 4;
        ensureSpace(pvH);
        drawRoundedRect(doc, mx, y, cw, pvH, 3, C.altRow, C.border);
        y += 6;
        doc.setFontSize(8).setFont("helvetica", "bold").setTextColor(C.muted);
        doc.text("PV SUMMARY", mx + 8, y);
        y += 5;
        for (const [label, value] of pvItems) { kvRow(doc, mx + 8, y, label, value, cw - 16); y += ROW_H; }
        y += 4;
      }

      // Intrinsic Value highlight
      drawIVBar("Intrinsic Value", entry.intrinsic_value, mColor);

      // Current Price + Verdict
      if (entry.intrinsic_value != null) drawPriceVerdict(entry.intrinsic_value, summary.currentPrice);

      // MoS + buy price
      if (entry.intrinsic_value != null) drawMosBuyPrice(entry.intrinsic_value, summary.marginOfSafety);
    }

    // ═════════════════════════════════════════════════════════════
    // MULTIPLES — Full analysis detail
    // ═════════════════════════════════════════════════════════════
    if (m === "multiples") {
      // Method card
      { const method = a.method as string | undefined;
        const fl: string[] = [];
        if (method) fl.push(`Method: ${method}`);
        drawFormulaBox(fl);
      }

      // Input parameters
      const multipleType = (params.multiple_type as string) ?? "P/E";
      const metricLabel = multipleType === "P/E" ? "EPS" : "Metric Value";
      const multParams: [string, string][] = [
        ["Multiple Type", multipleType],
        [metricLabel, fmtN(params.metric_value as number | null)],
        [`Avg ${multipleType}`, fmtN(params.peer_multiple as number | null)],
      ];
      if (params.shares_outstanding != null) multParams.push(["Shares Outstanding", fmtBig(params.shares_outstanding as number | null)]);
      const mH = 11 + multParams.length * ROW_H + 4;
      ensureSpace(mH);
      drawRoundedRect(doc, mx, y, cw, mH, 3, C.white, C.border);
      y += 6;
      doc.setFontSize(8).setFont("helvetica", "bold").setTextColor(C.muted);
      doc.text("INPUT PARAMETERS", mx + 8, y);
      y += 5;
      for (const [label, value] of multParams) { kvRow(doc, mx + 8, y, label, value, cw - 16); y += ROW_H; }
      y += 4;

      // Implied calculation
      const impliedTotal = a.implied_total as number | undefined;
      const mv = params.metric_value as number | undefined;
      const pm = params.peer_multiple as number | undefined;
      if (mv != null && pm != null) {
        ensureSpace(18);
        drawRoundedRect(doc, mx, y, cw, 14, 3, lightTint(mColor));
        doc.setFontSize(9).setFont("helvetica", "bold").setTextColor(C.textDark);
        const calcText = `${metricLabel} ${fmtN(mv)}  \u00D7  Avg ${multipleType} ${fmtN(pm)}  =`;
        doc.text(calcText, mx + 8, y + 6.5);
        doc.setFontSize(12).setTextColor(mColor);
        doc.text(fmtN(impliedTotal ?? mv * pm), mx + cw - 8, y + 7, { align: "right" });
        y += 18;
      }

      // Intrinsic Value / Share highlight
      drawIVBar("Intrinsic Value / Share", entry.intrinsic_value, mColor);

      // Current Price + Verdict
      if (entry.intrinsic_value != null) drawPriceVerdict(entry.intrinsic_value, summary.currentPrice);

      // MoS + buy price
      if (entry.intrinsic_value != null) drawMosBuyPrice(entry.intrinsic_value, summary.marginOfSafety);
    }

    y += 6;
  }

  // ── Finalize: add footers to all pages ─────────────────────────
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    drawPageFooter(p, totalPages);
  }

  // ── Save ───────────────────────────────────────────────────────
  const filename = `${summary.stockSymbol}_valuation_report_${todayISO()}.pdf`;
  if (Platform.OS === "web") {
    doc.save(filename);
  } else {
    const { Paths, File } = await import("expo-file-system");
    const Sharing = await import("expo-sharing");
    const pdfBytes = doc.output("arraybuffer");
    const file = new File(Paths.document, filename);
    file.write(new Uint8Array(pdfBytes));
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(file.uri, { mimeType: "application/pdf" });
    }
  }
}

// ── Excel Export (comprehensive) ─────────────────────────────────

export function buildValuationExcelTables(
  summary: ValuationSummaryData,
  valuations: ValuationEntry[],
): { title: string; headers: string[]; rows: (string | number | null)[][] }[] {
  const tables: { title: string; headers: string[]; rows: (string | number | null)[][] }[] = [];

  // ── Summary table ──────────────────────────────────────────────
  const summaryModels = Object.keys(summary.models);
  if (summaryModels.length > 0) {
    const summRows: (string | number | null)[][] = [];
    for (const m of summaryModels) {
      const { iv } = summary.models[m];
      const buyBelow = iv * (1 - summary.marginOfSafety / 100);
      summRows.push([m.toUpperCase(), Number(iv.toFixed(2)), Number(buyBelow.toFixed(2))]);
    }
    if (summary.avgIV != null) {
      summRows.push([]);
      summRows.push(["Average", Number(summary.avgIV.toFixed(2)), summary.avgBuyBelow != null ? Number(summary.avgBuyBelow.toFixed(2)) : null]);
    }
    if (summary.currentPrice != null && summary.avgIV != null) {
      const diff = ((summary.avgIV - summary.currentPrice) / summary.currentPrice * 100);
      summRows.push([]);
      summRows.push(["Current Price", summary.currentPrice, null]);
      summRows.push(["Upside/Downside", `${diff >= 0 ? "+" : ""}${diff.toFixed(2)}%`, null]);
      summRows.push(["Verdict", diff > 0 ? "UNDERVALUED" : "OVERVALUED", null]);
      summRows.push(["Margin of Safety", `${summary.marginOfSafety}%`, null]);
    }
    tables.push({ title: "Valuation Summary", headers: ["Model", "Intrinsic Value", "Buy Below"], rows: summRows });
  }

  // ── Per-model tables ───────────────────────────────────────────
  const latestPerModel: Record<string, ValuationEntry> = {};
  for (const v of valuations) {
    if (v.intrinsic_value != null && !latestPerModel[v.model_type]) {
      latestPerModel[v.model_type] = v;
    }
  }

  const modelOrder = ["graham", "dcf", "ddm", "multiples"];
  for (const m of modelOrder) {
    const entry = latestPerModel[m];
    if (!entry) continue;
    const label = MODEL_LABELS[m] ?? m.toUpperCase();
    const rows: (string | number | null)[][] = [];
    const params = entry.parameters ?? {};
    const a = (entry.assumptions ?? {}) as Record<string, unknown>;

    rows.push(["Intrinsic Value", entry.intrinsic_value != null ? Number(entry.intrinsic_value.toFixed(2)) : null]);
    rows.push(["Date", entry.valuation_date]);

    // ── Graham ─────────────────────────────────────
    if (m === "graham") {
      rows.push([]);
      rows.push(["--- Input Parameters ---", null]);
      rows.push(["EPS (TTM)", typeof params.eps === "number" ? Number((params.eps as number).toFixed(2)) : null]);
      rows.push(["Growth Rate (g)", typeof params.growth_rate === "number" ? `${(params.growth_rate as number).toFixed(2)}%` : null]);
      rows.push(["AAA Bond Yield (Y)", typeof params.aaa_yield === "number" ? `${(params.aaa_yield as number).toFixed(2)}%` : null]);
      rows.push([]);
      rows.push(["--- Calculation Results ---", null]);
      const gRate = typeof params.growth_rate === "number" ? params.growth_rate as number : 0;
      const basePeOrig = (a.base_pe_original as number) ?? 8.5;
      const basePeRev = (a.base_pe_revised as number) ?? 7;
      rows.push(["P/E Original", Number((basePeOrig + 2 * gRate).toFixed(1))]);
      rows.push(["IV Original", typeof params.iv_original === "number" ? Number((params.iv_original as number).toFixed(4)) : null]);
      rows.push(["P/E Revised", Number((basePeRev + 1 * gRate).toFixed(1))]);
      rows.push(["IV Revised", typeof params.iv_revised === "number" ? Number((params.iv_revised as number).toFixed(4)) : null]);
      if (a.formula_original) rows.push(["Formula (Original)", a.formula_original as string]);
      if (a.formula_revised) rows.push(["Formula (Revised)", a.formula_revised as string]);
      const grahamPrice = (params.price as number | null) ?? summary.currentPrice;
      if (grahamPrice != null && entry.intrinsic_value != null) {
        rows.push([]);
        rows.push(["Current Price", Number(grahamPrice)]);
        const diff = ((entry.intrinsic_value - grahamPrice) / grahamPrice * 100);
        rows.push(["Upside/Downside", `${diff >= 0 ? "+" : ""}${diff.toFixed(2)}%`]);
        const verdict = entry.intrinsic_value > grahamPrice * 1.03 ? "Undervalued"
          : entry.intrinsic_value < grahamPrice * 0.97 ? "Overvalued" : "Fair Value";
        rows.push(["Verdict", verdict]);
      }
    }

    // ── DCF ────────────────────────────────────────
    if (m === "dcf") {
      // Projections (shown first, matching UI)
      const dcfProj = (a.projections ?? []) as Array<{ year: number; stage: number; fcf: number; pv: number }>;
      if (dcfProj.length > 0) {
        rows.push([]);
        rows.push(["--- Cash Flow Projections ---", null]);
        const baseYear = new Date().getFullYear();
        for (const p of dcfProj) {
          rows.push([`Year ${baseYear + p.year - 1} (S${p.stage})`, `FCF: ${fmtBig(p.fcf)}, PV: ${fmtBig(p.pv)}`]);
        }
        if (typeof a.terminal_value === "number") rows.push(["Terminal Value", Number((a.terminal_value as number).toFixed(2))]);
        if (typeof a.pv_terminal === "number") rows.push(["PV of Terminal Value", Number((a.pv_terminal as number).toFixed(2))]);
      }

      // Equity Bridge (shown second, matching UI)
      rows.push([]);
      rows.push(["--- Equity Bridge ---", null]);
      if (typeof a.pv_fcfs === "number") rows.push(["Sum of PV (FCF)", Number((a.pv_fcfs as number).toFixed(2))]);
      rows.push(["Cash & Equivalents", typeof a.cash === "number" ? Number(a.cash) : (typeof params.cash === "number" ? Number(params.cash) : null)]);
      rows.push(["Total Debt", typeof a.debt === "number" ? Number(a.debt) : (typeof params.debt === "number" ? Number(params.debt) : null)]);
      if (typeof a.equity_value === "number") rows.push(["Equity Value", Number((a.equity_value as number).toFixed(2))]);

      // Assumptions (shown third, matching UI)
      rows.push([]);
      rows.push(["--- Assumptions ---", null]);
      rows.push(["Base FCF", typeof params.fcf === "number" ? Number(params.fcf) : null]);
      rows.push(["Stage 1 Growth", typeof params.growth_stage1 === "number" ? fmtPct(params.growth_stage1 as number) : null]);
      rows.push(["Stage 2 Growth", typeof params.growth_stage2 === "number" ? fmtPct(params.growth_stage2 as number) : null]);
      rows.push(["Discount Rate", typeof params.discount_rate === "number" ? fmtPct(params.discount_rate as number) : null]);
      rows.push(["Perpetual Growth", typeof params.terminal_growth === "number" ? fmtPct(params.terminal_growth as number) : null]);
      rows.push(["Stage 1 Years", params.stage1_years != null ? Number(params.stage1_years) : null]);
      rows.push(["Stage 2 Years", params.stage2_years != null ? Number(params.stage2_years) : null]);
      rows.push(["Shares Outstanding", typeof params.shares_outstanding === "number" ? Number(params.shares_outstanding) : null]);

      // WACC
      const wacc = params.wacc as Record<string, number> | undefined;
      if (wacc) {
        rows.push([]);
        rows.push(["--- WACC ---", null]);
        if (wacc.risk_free_rate != null) rows.push(["Risk-Free Rate", fmtPct(wacc.risk_free_rate)]);
        if (wacc.beta != null) rows.push(["Beta", wacc.beta.toFixed(2)]);
        if (wacc.equity_risk_premium != null) rows.push(["Equity Risk Premium", fmtPct(wacc.equity_risk_premium)]);
        if (wacc.cost_of_equity != null) rows.push(["Cost of Equity (Ke)", fmtPct(wacc.cost_of_equity)]);
        if (wacc.cost_of_debt != null) rows.push(["Cost of Debt (Kd)", fmtPct(wacc.cost_of_debt)]);
        if (wacc.tax_rate != null) rows.push(["Tax Rate", fmtPct(wacc.tax_rate)]);
        if (wacc.weight_equity != null) rows.push(["Equity Weight", fmtPct(wacc.weight_equity)]);
        if (wacc.weight_debt != null) rows.push(["Debt Weight", fmtPct(wacc.weight_debt)]);
      }

      if (typeof a.tv_pct_of_ev === "number") rows.push(["TV % of Enterprise Value", `${(a.tv_pct_of_ev as number).toFixed(1)}%`]);

      if (summary.currentPrice != null && entry.intrinsic_value != null) {
        rows.push([]);
        rows.push(["Current Price", Number(summary.currentPrice)]);
        const diff = ((entry.intrinsic_value - summary.currentPrice) / summary.currentPrice * 100);
        rows.push(["Upside/Downside", `${diff >= 0 ? "+" : ""}${diff.toFixed(2)}%`]);
      }
    }

    // ── DDM ────────────────────────────────────────
    if (m === "ddm") {
      if (a.method) rows.push(["Method", a.method as string]);
      if (a.formula) rows.push(["Formula", a.formula as string]);
      rows.push([]);
      rows.push(["--- Input Parameters ---", null]);
      rows.push(["Last Dividend", typeof params.last_dividend === "number" ? Number((params.last_dividend as number).toFixed(4)) : null]);
      rows.push(["Growth Rate (g)", typeof params.growth_rate === "number" ? fmtPct(params.growth_rate as number) : null]);
      rows.push(["Required Return (r)", typeof params.required_return === "number" ? fmtPct(params.required_return as number) : null]);
      if (params.high_growth_years != null) rows.push(["High-Growth Years", Number(params.high_growth_years)]);
      if (params.high_growth_rate != null) rows.push(["High-Growth Rate", typeof params.high_growth_rate === "number" ? fmtPct(params.high_growth_rate as number) : null]);

      if (a.d1 != null || a.spread != null) {
        rows.push([]);
        rows.push(["--- Derived Values ---", null]);
        if (typeof a.d1 === "number") rows.push(["D₁ (Next Dividend)", Number((a.d1 as number).toFixed(4))]);
        if (typeof a.spread === "number") rows.push(["Spread (r − g)", fmtPct(a.spread as number)]);
      }

      const ddmProj = (a.projections ?? []) as Array<{ year: number; dividend: number; pv: number }>;
      if (ddmProj.length > 0) {
        rows.push([]);
        rows.push(["--- Dividend Projections ---", null]);
        for (const p of ddmProj) {
          rows.push([`Year ${p.year}`, `Div: ${fmtN(p.dividend)}, PV: ${fmtN(p.pv)}`]);
        }
      }

      if (typeof a.pv_dividends === "number") rows.push(["Σ PV of Dividends", Number((a.pv_dividends as number).toFixed(2))]);
      if (typeof a.pv_terminal === "number") rows.push(["PV of Terminal Value", Number((a.pv_terminal as number).toFixed(2))]);

      if (summary.currentPrice != null && entry.intrinsic_value != null) {
        rows.push([]);
        rows.push(["Current Price", Number(summary.currentPrice)]);
        const diff = ((entry.intrinsic_value - summary.currentPrice) / summary.currentPrice * 100);
        rows.push(["Upside/Downside", `${diff >= 0 ? "+" : ""}${diff.toFixed(2)}%`]);
      }
    }

    // ── Multiples ──────────────────────────────────
    if (m === "multiples") {
      if (a.method) rows.push(["Method", a.method as string]);
      rows.push([]);
      rows.push(["--- Input Parameters ---", null]);
      const multipleType = (params.multiple_type as string) ?? "P/E";
      const metricLabel = multipleType === "P/E" ? "EPS" : "Metric Value";
      rows.push(["Multiple Type", multipleType]);
      rows.push([metricLabel, typeof params.metric_value === "number" ? Number((params.metric_value as number).toFixed(2)) : null]);
      rows.push([`Avg ${multipleType}`, typeof params.peer_multiple === "number" ? Number((params.peer_multiple as number).toFixed(2)) : null]);
      if (params.shares_outstanding != null) rows.push(["Shares Outstanding", Number(params.shares_outstanding)]);

      const impliedTotal = a.implied_total as number | undefined;
      const mv = params.metric_value as number | undefined;
      const pm = params.peer_multiple as number | undefined;
      if (mv != null && pm != null) {
        rows.push([]);
        rows.push([`${metricLabel} × Avg ${multipleType}`, Number((impliedTotal ?? mv * pm).toFixed(2))]);
      }

      if (summary.currentPrice != null && entry.intrinsic_value != null) {
        rows.push([]);
        rows.push(["Current Price", Number(summary.currentPrice)]);
        const diff = ((entry.intrinsic_value - summary.currentPrice) / summary.currentPrice * 100);
        rows.push(["Upside/Downside", `${diff >= 0 ? "+" : ""}${diff.toFixed(2)}%`]);
      }
    }

    tables.push({ title: label, headers: ["Parameter", "Value"], rows });
  }

  return tables;
}
