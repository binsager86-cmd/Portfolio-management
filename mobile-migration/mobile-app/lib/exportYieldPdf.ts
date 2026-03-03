/**
 * exportYieldPdf — Generate a modern, branded PDF report
 * for the Dividend Yield Calculator results.
 *
 * Uses jsPDF (no external fonts/images needed).
 * Works on web — triggers browser download.
 * Supports automatic page breaks so content never gets cut off.
 *
 * NOTE: jsPDF built-in fonts (Helvetica) do NOT support emoji/unicode
 * symbols, so we use plain-text section labels only.
 */

// jsPDF is imported dynamically inside the export function
// to avoid SSR/Metro node-bundle resolution issues.
type jsPDF = import("jspdf").jsPDF;

// ── Types ────────────────────────────────────────────────────────────

export interface YieldCalcInput {
  companyName?: string;
  purchasePrice: number;
  shares: number;
  parValue: number;
  divPercent: number;
  bonusPercent: number;
  preExPrice: number;
  includeCashInEx: boolean;
}

export interface YieldCalcResult {
  totalCost: number;
  parValue: number;
  cashDivPerShare: number;
  totalCashDiv: number;
  cashYieldOnCost: number;
  bonusShares: number;
  preExPrice: number;
  bonusValueBeforeEx: number;
  totalReturnBeforeEx: number;
  yieldBeforeEx: number;
  theoreticalExPrice: number;
  bonusValueAfterEx: number;
  totalReturnAfterEx: number;
  yieldAfterEx: number;
  totalSharesAfterEx: number;
  adjustedAvgCost: number;
  hasBonus: boolean;
  hasExDateAdj: boolean;
}

// ── Palette ──────────────────────────────────────────────────────────

const C = {
  bg: "#FFFFFF",
  headerBg: "#0F172A",
  primary: "#6366F1",
  primaryLight: "#E0E7FF",
  success: "#059669",
  successLight: "#D1FAE5",
  accent: "#0891B2",
  accentLight: "#CFFAFE",
  warning: "#D97706",
  warningLight: "#FEF3C7",
  danger: "#DC2626",
  muted: "#64748B",
  border: "#E2E8F0",
  textDark: "#1E293B",
  textMedium: "#475569",
  textLight: "#94A3B8",
  white: "#FFFFFF",
};

// ── Constants ────────────────────────────────────────────────────────
const ROW_H = 7;        // height per metric row
const SEP_H = 4;        // extra height for a top-border separator
const CARD_PAD_TOP = 16; // from card top to first row (includes title)
const CARD_PAD_BOT = 5;  // bottom padding inside card

/** Calculate total card height given rows and separators count */
function cardHeight(rows: number, separators: number): number {
  return CARD_PAD_TOP + rows * ROW_H + separators * SEP_H + CARD_PAD_BOT;
}

// ── Helpers ──────────────────────────────────────────────────────────

function fmtKwd(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 3, maximumFractionDigits: 3 }) + " KWD";
}

function fmtPct(n: number): string {
  return n.toFixed(2) + "%";
}

function fmtNum(n: number, d = 3): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}

// ── Drawing Primitives ───────────────────────────────────────────────

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

function drawBadge(
  doc: jsPDF,
  x: number,
  y: number,
  text: string,
  bgColor: string,
  textColor: string,
) {
  doc.setFontSize(8);
  const tw = doc.getTextWidth(text);
  const pw = tw + 8;
  drawRoundedRect(doc, x, y - 4, pw, 7, 2, bgColor);
  doc.setTextColor(textColor);
  doc.text(text, x + 4, y);
}

// ── Main Export ──────────────────────────────────────────────────────

export async function exportYieldCalcPdf(
  input: YieldCalcInput,
  result: YieldCalcResult,
) {
  let jsPDFConstructor;
  try {
    const mod = await import("jspdf");
    jsPDFConstructor = mod.jsPDF;
  } catch (err) {
    console.error("Failed to load jsPDF:", err);
    throw new Error(
      "PDF generation is not available. Please ensure jspdf is installed.",
    );
  }
  const doc = new jsPDFConstructor({ unit: "mm", format: "a4" });
  const W = 210; // A4 width
  const H = 297; // A4 height
  const mx = 18; // margin
  const cw = W - mx * 2; // content width
  const footerZone = 22; // reserved space at bottom for footer
  const maxY = H - footerZone; // don't draw content below this
  let y = 0;

  // ─── Page Break Helper ───────────────────────────────────────────
  function ensureSpace(needed: number) {
    if (y + needed > maxY) {
      doc.addPage();
      y = 18;
    }
  }

  // ─── Metric Row Helper ──────────────────────────────────────────
  function metricRow(
    label: string,
    value: string,
    valueColor: string = C.textDark,
    bold: boolean = false,
    topBorder: boolean = false,
  ) {
    if (topBorder) {
      doc.setDrawColor(C.border);
      doc.setLineWidth(0.2);
      doc.line(mx + 10, y, mx + cw - 10, y);
      y += SEP_H;
    }
    doc.setFontSize(9.5);
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setTextColor(bold ? C.textDark : C.textMedium);
    doc.text(label, mx + 10, y);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(valueColor);
    doc.text(value, mx + cw - 10, y, { align: "right" });
    y += ROW_H;
  }

  // ─── Section Title Helper (colored bar + text, no emoji) ─────────
  function sectionTitle(label: string, color: string, cardY: number) {
    // Small colored dot/circle before the text
    doc.setFillColor(color);
    doc.circle(mx + 13, cardY + 8, 2, "F");

    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(color);
    doc.text(label, mx + 18, cardY + 10);
  }

  // ─── Header Bar ──────────────────────────────────────────────────
  drawRoundedRect(doc, 0, 0, W, 42, 0, C.headerBg);

  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(C.white);
  doc.text("Dividend Yield Report", mx, 20);

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(C.textLight);
  const today = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  doc.text(`Generated on ${today}`, mx, 30);

  // Badge on right
  drawBadge(doc, W - mx - 30, 22, "YIELD CALC", C.primary, C.white);

  y = 52;

  // ─── Company Name (prominent, below header) ──────────────────
  if (input.companyName) {
    ensureSpace(16);
    doc.setFontSize(16);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(C.textDark);
    doc.text(input.companyName, W / 2, y, { align: "center" });
    // Subtle underline
    const tw = doc.getTextWidth(input.companyName);
    doc.setDrawColor(C.primary);
    doc.setLineWidth(0.5);
    doc.line(W / 2 - tw / 2, y + 2, W / 2 + tw / 2, y + 2);
    y += 12;
  }

  // ─── Assumptions Card ────────────────────────────────────────────
  const inclNote = input.includeCashInEx || result.hasBonus;
  const assumeH = inclNote ? 72 : 58;
  ensureSpace(assumeH + 6);
  drawRoundedRect(doc, mx, y, cw, assumeH, 4, C.white, C.border);

  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(C.textDark);
  doc.text("Assumptions & Inputs", mx + 8, y + 10);

  doc.setDrawColor(C.border);
  doc.setLineWidth(0.3);
  doc.line(mx + 8, y + 14, mx + cw - 8, y + 14);

  const col1x = mx + 10;
  const col2x = mx + cw / 2 + 4;
  let ry = y + 22;

  const inputRows: [string, string, string, string][] = [
    ["Purchase Price", fmtNum(input.purchasePrice), "Number of Shares", input.shares.toLocaleString()],
    ["Par / Nominal Value", fmtNum(input.parValue), "Cash Dividend %", fmtPct(input.divPercent)],
    ["Pre Ex-Date Price", fmtNum(input.preExPrice), "Bonus Share %", input.bonusPercent > 0 ? fmtPct(input.bonusPercent) : "None"],
  ];

  for (const [l1, v1, l2, v2] of inputRows) {
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(C.muted);
    doc.text(l1, col1x, ry);
    doc.text(l2, col2x, ry);

    doc.setFont("helvetica", "bold");
    doc.setTextColor(C.textDark);
    doc.text(v1, col1x, ry + 5);
    doc.text(v2, col2x, ry + 5);

    ry += 14;
  }

  if (input.includeCashInEx) {
    doc.setFontSize(8);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(C.muted);
    doc.text("* Cash dividend included in ex-date price adjustment", col1x, ry);
    ry += 6;
  } else if (result.hasBonus) {
    doc.setFontSize(8);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(C.muted);
    doc.text("* Cash dividend excluded from ex-date price adjustment", col1x, ry);
    ry += 6;
  }

  y = ry + 6;

  // ─── Cash Dividend Card ──────────────────────────────────────────
  // Rows: totalCost, cashDivPerShare, totalCashDiv, cashYieldOnCost(sep)
  const cashH = cardHeight(4, 1);
  ensureSpace(cashH + 6);
  const cashCardY = y;
  drawRoundedRect(doc, mx, y, cw, cashH, 4, C.white, C.border);
  drawRoundedRect(doc, mx, y, 3, cashH, 1.5, C.success);
  sectionTitle("Cash Dividend", C.success, y);
  y += CARD_PAD_TOP;

  metricRow("Total Investment Cost", fmtKwd(result.totalCost));
  metricRow("Cash Dividend per Share", fmtNum(result.cashDivPerShare));
  metricRow("Total Cash Dividend", fmtKwd(result.totalCashDiv), C.success);
  metricRow("Cash Yield on Cost", fmtPct(result.cashYieldOnCost), C.success, true, true);

  y = cashCardY + cashH + 6;

  // ─── Before Ex-Date Card ─────────────────────────────────────────
  // Rows: preExPrice, [bonusShares, bonusValue], totalReturn(sep), yield
  const beforeRows = result.hasBonus ? 5 : 3;
  const beforeSeps = 1; // totalReturn separator
  const beforeH = cardHeight(beforeRows, beforeSeps);
  ensureSpace(beforeH + 6);
  const beforeCardY = y;
  drawRoundedRect(doc, mx, y, cw, beforeH, 4, C.white, C.border);
  drawRoundedRect(doc, mx, y, 3, beforeH, 1.5, C.accent);
  sectionTitle("Before Ex-Date Yield", C.accent, y);
  y += CARD_PAD_TOP;

  metricRow("Pre Ex-Date Price", fmtNum(result.preExPrice));
  if (result.hasBonus) {
    metricRow("Bonus Shares", result.bonusShares.toLocaleString(), C.accent);
    metricRow("Bonus Value (x pre-ex)", fmtKwd(result.bonusValueBeforeEx), C.accent);
  }
  metricRow("Total Return", fmtKwd(result.totalReturnBeforeEx), C.success, true, true);
  metricRow("Yield on Cost", fmtPct(result.yieldBeforeEx), C.success, true);

  y = beforeCardY + beforeH + 6;

  // ─── After Ex-Date Card (if any ex-date adjustment) ──────────────
  if (result.hasExDateAdj) {
    // Count rows precisely:
    //   exPrice, formula, priceDrop = 3
    //   [bonusShares, bonusValue] = +2 if hasBonus
    //   totalReturn(sep), yield = 2 (1 sep)
    //   totalSharesAfterEx(sep), adjustedAvgCost = 2 (1 sep)
    let afterRows = 3;
    let afterSeps = 2; // totalReturn sep + totalSharesAfterEx sep
    if (result.hasBonus) afterRows += 2;
    afterRows += 4; // totalReturn, yield, totalShares, adjAvgCost
    const afterH = cardHeight(afterRows, afterSeps);

    ensureSpace(afterH + 6);
    const afterCardY = y;
    drawRoundedRect(doc, mx, y, cw, afterH, 4, C.white, C.border);
    drawRoundedRect(doc, mx, y, 3, afterH, 1.5, C.warning);
    sectionTitle("After Ex-Date Yield", C.warning, y);
    y += CARD_PAD_TOP;

    metricRow("Theoretical Ex-Price", fmtNum(result.theoreticalExPrice));

    const formulaText =
      result.hasBonus && input.includeCashInEx
        ? "(P - Div) / (1+Bonus%)"
        : result.hasBonus
        ? "P / (1+Bonus%)"
        : "P - CashDiv/share";
    metricRow("Adjustment Formula", formulaText, C.textLight);

    const priceDrop = result.preExPrice - result.theoreticalExPrice;
    const priceDropPct = result.preExPrice > 0 ? (priceDrop / result.preExPrice) * 100 : 0;
    metricRow(
      "Price Drop",
      "-" + fmtNum(priceDrop) + "  (" + fmtPct(priceDropPct) + ")",
      C.danger,
    );

    if (result.hasBonus) {
      metricRow("Bonus Shares", result.bonusShares.toLocaleString(), C.accent);
      metricRow("Bonus Value (x ex price)", fmtKwd(result.bonusValueAfterEx), C.accent);
    }

    metricRow("Total Return", fmtKwd(result.totalReturnAfterEx), C.success, true, true);
    metricRow("Yield on Cost", fmtPct(result.yieldAfterEx), C.success, true);

    metricRow("Total Shares After Ex", result.totalSharesAfterEx.toLocaleString(), C.textDark, false, true);
    metricRow("Adjusted Avg Cost", fmtKwd(result.adjustedAvgCost), C.primary, true);

    y = afterCardY + afterH + 6;
  }

  // ─── Summary Banner ──────────────────────────────────────────────
  const hasAfterYield = result.hasExDateAdj;
  const summaryRows = hasAfterYield ? 4 : 2;
  const summarySeps = hasAfterYield ? 1 : 0;
  const summaryH = cardHeight(summaryRows, summarySeps);
  ensureSpace(summaryH + 6);
  const summaryCardY = y;
  drawRoundedRect(doc, mx, y, cw, summaryH, 4, C.primaryLight, C.primary);

  // Section title with colored dot
  doc.setFillColor(C.primary);
  doc.circle(mx + 13, y + 8, 2, "F");
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(C.primary);
  doc.text("Yield Summary", mx + 18, y + 10);
  y += CARD_PAD_TOP;

  metricRow("Cash Yield on Cost", fmtPct(result.cashYieldOnCost), C.success, true);
  metricRow("Before Ex-Date Total Yield", fmtPct(result.yieldBeforeEx), C.success, true);
  if (hasAfterYield) {
    metricRow("After Ex-Date Total Yield", fmtPct(result.yieldAfterEx), C.success, true);
    const diff = result.yieldBeforeEx - result.yieldAfterEx;
    metricRow("Yield Difference", fmtPct(diff), C.danger, true, true);
  }

  y = summaryCardY + summaryH + 10;

  // ─── Disclaimer (inside content area, below summary) ─────────────
  ensureSpace(20);
  drawRoundedRect(doc, mx, y, cw, 16, 3, "#F8FAFC", C.border);
  doc.setFontSize(7);
  doc.setFont("helvetica", "italic");
  doc.setTextColor(C.muted);
  doc.text("Disclaimer: This report is for informational purposes only and does not constitute financial advice.", mx + 6, y + 6);
  doc.text("Past performance does not guarantee future results.", mx + 6, y + 11);
  y += 20;

  // ─── Page Footer(s) ──────────────────────────────────────────────
  const totalPages: number = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setDrawColor(C.border);
    doc.setLineWidth(0.3);
    doc.line(mx, H - 16, mx + cw, H - 16);

    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(C.textLight);
    doc.text("Portfolio App -- Dividend Yield Calculator", mx, H - 11);
    doc.text("Page " + p + " of " + totalPages, mx + cw, H - 11, { align: "right" });
  }

  // ─── Download ────────────────────────────────────────────────────
  const filename = `yield-report-${new Date().toISOString().slice(0, 10)}.pdf`;

  // Platform-aware save: browser download on web, share sheet on mobile
  const { Platform } = await import("react-native");

  if (Platform.OS === "web") {
    doc.save(filename);
  } else {
    // On iOS/Android, write to the file system and open the share sheet
    const pdfBase64 = doc.output("datauristring").split(",")[1];
    try {
      const FileSystem = await import("expo-file-system");
      const Sharing = await import("expo-sharing");

      const fileUri = FileSystem.documentDirectory + filename;
      await FileSystem.writeAsStringAsync(fileUri, pdfBase64, {
        encoding: FileSystem.EncodingType.Base64,
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: "application/pdf",
          dialogTitle: "Save Yield Report",
          UTI: "com.adobe.pdf",
        });
      } else {
        throw new Error("Sharing is not available on this device.");
      }
    } catch (err) {
      console.error("Failed to save PDF on mobile:", err);
      throw new Error("Could not save PDF. Please try again.");
    }
  }
}
