/**
 * Test script to reproduce the PDF export with HUMANSOFT-like data.
 * Run with: node scripts/test-pdf-export.js
 */
const { jsPDF } = require("jspdf");
const fs = require("fs");

// Simulate the categories data matching HUMANSOFT.KW structure
// 8 categories, 11 years (2015-2025)
const years = [2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025];

const categories = {
  profitability: {
    label: "Profitability",
    color: "#10b981",
    metricNames: ["Gross Margin", "Operating Margin", "Net Margin", "ROA", "ROE", "DuPont ROE", "EBITDA Margin"],
    years,
    yearData: {},
  },
  liquidity: {
    label: "Liquidity",
    color: "#3b82f6",
    metricNames: ["Current Ratio", "Quick Ratio", "Cash Ratio"],
    years,
    yearData: {},
  },
  leverage: {
    label: "Capital Structure",
    color: "#f59e0b",
    metricNames: ["Debt-to-Equity", "Debt-to-Assets", "Debt-to-Capital", "Financial Leverage", "Debt / EBITDA", "Interest Coverage", "Equity Multiplier"],
    years,
    yearData: {},
  },
  efficiency: {
    label: "Efficiency",
    color: "#8b5cf6",
    metricNames: ["Asset Turnover", "Fixed Asset Turnover", "Working Capital Turnover", "Receivables Turnover", "Days Sales Outstanding", "Inventory Turnover", "Days Inventory", "Payables Turnover", "Days Payable", "Cash Conversion Cycle"],
    years,
    yearData: {},
  },
  valuation: {
    label: "Valuation (Per-Share)",
    color: "#ec4899",
    metricNames: ["Book Value / Share", "EPS", "Dividends / Share", "Payout Ratio", "Retention Rate", "Sustainable Growth Rate"],
    years,
    yearData: {},
  },
  cashflow: {
    label: "Cash Flow",
    color: "#06b6d4",
    metricNames: ["Cash from Operations", "Cash from Investing", "Cash from Financing", "Free Cash Flow", "FCF Margin", "FCF / Share", "CFO / Net Income", "CAPEX PPE", "CAPEX Intangibles"],
    years,
    yearData: {},
  },
  growth: {
    label: "Growth Rates",
    color: "#f97316",
    metricNames: ["Revenue Growth", "Net Income Growth", "EPS Growth", "Total Assets Growth", "Operating Cash Flow Growth", "FCF Growth"],
    years,
    yearData: {},
  },
  ddm_manual_dps: {
    label: "ddm_manual_dps",
    color: "#6366f1",
    metricNames: ["Manual DPS"],
    years: [2024, 2025],
    yearData: {},
  },
};

// Fill yearData with sample values
for (const [key, cat] of Object.entries(categories)) {
  for (const yr of cat.years) {
    cat.yearData[yr] = {};
    for (const name of cat.metricNames) {
      cat.yearData[yr][name] = Math.random() * (name.includes("Margin") ? 0.5 : name.includes("Ratio") ? 3 : 1000);
    }
  }
}

// Now reproduce the EXACT PDF generation from exportMetricsPdf.ts
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
  cardBg: "#FFFFFF",
};

const CAT_COLORS = {
  profitability: "#10b981",
  liquidity: "#3b82f6",
  leverage: "#f59e0b",
  efficiency: "#8b5cf6",
  valuation: "#ec4899",
  cashflow: "#06b6d4",
  growth: "#f97316",
};

const ROW_H = 6.2;
const HEADER_ROW_H = 7;
const SECTION_GAP = 8;
const PAGE_MX = 14;
const PAGE_HEADER_H = 28;
const PAGE_FOOTER_H = 14;

const stockSymbol = "HUMANSOFT.KW";
const totalMetrics = 359;

function fmtMetric(name, value) {
  const lc = name.toLowerCase();
  const isPct = ["margin", "roe", "roa", "growth", "payout", "retention"].some(k => lc.includes(k)) || lc.includes("dupont") || lc.includes("sustainable");
  if (isPct) return (value * 100).toFixed(1) + "%";
  if (lc.includes("days") || lc.includes("cycle")) return value.toFixed(0) + " days";
  const isMult = ["turnover", "coverage", "multiplier"].some(k => lc.includes(k)) || ["current ratio", "quick ratio", "cash ratio"].includes(lc);
  if (isMult) return value.toFixed(2) + "x";
  if (lc.includes("eps") || lc.includes("earnings per share")) return value.toFixed(3);
  return value.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
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

const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
const W = 210;
const H = 297;
const mx = PAGE_MX;
const cw = W - mx * 2;
const maxY = H - PAGE_FOOTER_H;
let y = 0;
let pageNum = 1;

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
  const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  doc.setFontSize(7.5).setTextColor(C.textLight);
  doc.text(today, W - mx, 21, { align: "right" });
}

function drawPageFooter(p, total) {
  doc.setPage(p);
  doc.setDrawColor(C.border);
  doc.setLineWidth(0.2);
  doc.line(mx, H - 10, mx + cw, H - 10);
  doc.setFontSize(6.5).setFont("helvetica", "normal").setTextColor(C.textLight);
  doc.text("Portfolio App -- Fundamental Analysis", mx, H - 6);
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

// Start drawing
drawPageHeader();
y = PAGE_HEADER_H + 6;

const catEntries = Object.entries(categories);
const allYears = new Set();
for (const [, cat] of catEntries) for (const yr of cat.years) allYears.add(yr);
const sortedYears = Array.from(allYears).sort();

const summaryH = 22;
ensureSpace(summaryH + 4);
drawRoundedRect(doc, mx, y, cw, summaryH, 3, C.primaryLight, C.primary);
doc.setFont("helvetica", "bold").setFontSize(10).setTextColor(C.primary);
doc.text("Overview", mx + 8, y + 7);
doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(C.textMedium);
const summaryItems = [
  `${catEntries.length} Categories`,
  `${totalMetrics} Metrics`,
  `${sortedYears.length} Year(s): ${sortedYears.map(yr => `FY${yr}`).join(", ")}`,
];
doc.text(summaryItems.join("   |   "), mx + 8, y + 15);
y += summaryH + SECTION_GAP;

let totalDataCells = 0;
let nullDataCells = 0;

for (const [catKey, cat] of catEntries) {
  const { label, metricNames, yearData, years: catYears } = cat;
  const catColor = CAT_COLORS[catKey] || C.primary;
  const sectionHeaderH = 12;
  const tableHeaderH = HEADER_ROW_H;
  const tableRowsH = metricNames.length * ROW_H;
  const totalNeeded = sectionHeaderH + tableHeaderH + tableRowsH + 6;

  ensureSpace(Math.min(totalNeeded, sectionHeaderH + tableHeaderH + ROW_H * 3 + 6));
  drawRoundedRect(doc, mx, y, cw, sectionHeaderH, 3, C.cardBg, C.border);
  drawRoundedRect(doc, mx, y, 3, sectionHeaderH, 1.5, catColor);

  doc.setFillColor(catColor);
  doc.circle(mx + 10, y + sectionHeaderH / 2, 2, "F");
  doc.setFont("helvetica", "bold").setFontSize(10).setTextColor(catColor);
  doc.text(label, mx + 16, y + sectionHeaderH / 2 + 1);
  drawBadge(doc, mx + cw - 32, y + sectionHeaderH / 2, `${metricNames.length}`, catColor + "20", catColor);
  y += sectionHeaderH + 2;

  const nameCW = cw * 0.36;
  const valCW = catYears.length > 0 ? (cw - nameCW) / catYears.length : cw - nameCW;

  ensureSpace(tableHeaderH + ROW_H * 2);
  doc.setFillColor(C.headerBg);
  doc.roundedRect(mx, y, cw, tableHeaderH, 1.5, 1.5, "F");
  doc.setFont("helvetica", "bold").setFontSize(7.5).setTextColor(C.white);
  doc.text("Metric", mx + 4, y + tableHeaderH / 2 + 1);
  for (let yi = 0; yi < catYears.length; yi++) {
    const xPos = mx + nameCW + yi * valCW + valCW / 2;
    doc.text(`FY${catYears[yi]}`, xPos, y + tableHeaderH / 2 + 1, { align: "center" });
  }
  y += tableHeaderH;

  for (let ri = 0; ri < metricNames.length; ri++) {
    ensureSpace(ROW_H + 2);
    const name = metricNames[ri];
    const rowY = y;
    if (ri % 2 === 1) {
      doc.setFillColor(C.altRow);
      doc.rect(mx, rowY - ROW_H / 2 - 0.8, cw, ROW_H, "F");
    }
    doc.setFont("helvetica", "normal").setFontSize(7).setTextColor(C.textMedium);
    doc.text(name, mx + 4, rowY, { maxWidth: nameCW - 8 });

    for (let yi = 0; yi < catYears.length; yi++) {
      const yr = catYears[yi];
      const val = yearData[yr]?.[name];
      const xCenter = mx + nameCW + yi * valCW + valCW / 2;
      totalDataCells++;
      if (val != null) {
        const formatted = fmtMetric(name, val);
        doc.setFont("helvetica", "bold").setFontSize(7).setTextColor(C.textDark);
        doc.text(formatted, xCenter, rowY, { align: "center" });
      } else {
        nullDataCells++;
        doc.setFont("helvetica", "normal").setFontSize(7).setTextColor(C.textLight);
        doc.text("--", xCenter, rowY, { align: "center" });
      }
    }
    y += ROW_H;
  }

  doc.setDrawColor(C.border);
  doc.setLineWidth(0.2);
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

// Page footers
const totalPages = doc.getNumberOfPages();
for (let p = 1; p <= totalPages; p++) {
  drawPageFooter(p, totalPages);
}

// Stats
console.log(`Pages: ${totalPages}`);
console.log(`Total data cells: ${totalDataCells}, Null cells: ${nullDataCells}`);
console.log(`Year columns per category: ${years.length}`);
console.log(`Column width per year: ${((cw - cw * 0.36) / years.length).toFixed(1)}mm`);

// Save to file
const buf = Buffer.from(doc.output("arraybuffer"));
fs.writeFileSync("test_metrics.pdf", buf);
console.log(`PDF size: ${buf.length} bytes`);
console.log("PDF saved as test_metrics.pdf");

// Check if the text is in the raw PDF
const raw = doc.output();
console.log(`Contains 'Gross Margin': ${raw.includes("Gross Margin")}`);
console.log(`Contains 'Profitability': ${raw.includes("Profitability")}`);
console.log(`Contains 'FY2024': ${raw.includes("FY2024")}`);
