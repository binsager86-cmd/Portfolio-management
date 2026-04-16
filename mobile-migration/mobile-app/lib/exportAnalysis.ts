/**
 * Export helpers for Fundamental Analysis panels.
 *
 * - exportCSV()   → .csv file (share / download)
 * - exportExcel() → .xlsx file via SheetJS
 * - exportPDF()   → .pdf file via jsPDF
 *
 * All work cross-platform (web download, native share sheet).
 */

import type { AISummary } from "@/lib/aiSummaryGenerator";
import { todayISO } from "@/lib/dateUtils";
import { sanitizePdfText } from "@/lib/sanitizePdf";
import { Platform } from "react-native";

// ── Types ────────────────────────────────────────────────────────────

export interface TableData {
  title: string;
  headers: string[];
  rows: (string | number | null | undefined)[][];
}

// ── Helpers ──────────────────────────────────────────────────────────

function buildFilename(symbol: string, panel: string, ext: string) {
  return `${symbol}_${panel.toLowerCase().replace(/\s+/g, "_")}_${todayISO()}.${ext}`;
}

// ── CSV ──────────────────────────────────────────────────────────────

function escapeCsv(val: string | number | null | undefined): string {
  if (val == null) return "";
  const str = String(val);
  if (str.includes(",") || str.includes('"') || str.includes("\n"))
    return `"${str.replace(/"/g, '""')}"`;
  return str;
}

function tablesToCsv(tables: TableData[]): string {
  const lines: string[] = [];
  for (const table of tables) {
    lines.push(table.title);
    lines.push(table.headers.map(escapeCsv).join(","));
    for (const row of table.rows) lines.push(row.map(escapeCsv).join(","));
    lines.push("");
  }
  return lines.join("\n");
}

// ── Excel (xlsx) — professional formatting ───────────────────────

async function tablesToXlsx(tables: TableData[]): Promise<Uint8Array> {
  const XLSX = await import("xlsx-js-style");
  const wb = XLSX.utils.book_new();

  // Style palette (mirrors the PDF header/primary colours)
  const headerFill = { fgColor: { rgb: "0F172A" } };
  const titleFill = { fgColor: { rgb: "6366F1" } };
  const altRowFill = { fgColor: { rgb: "F1F5F9" } };
  const totalFill = { fgColor: { rgb: "E0E7FF" } };
  const whiteFill = { fgColor: { rgb: "FFFFFF" } };
  const whiteFont = { color: { rgb: "FFFFFF" }, bold: true, sz: 12 };
  const headerFont = { color: { rgb: "FFFFFF" }, bold: true, sz: 10 };
  const bodyFont = { color: { rgb: "1E293B" }, sz: 10 };
  const totalFont = { color: { rgb: "1E293B" }, bold: true, sz: 10 };
  const thinBorder = { style: "thin", color: { rgb: "CBD5E1" } };
  const borders = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };
  const numFmt = "#,##0";

  for (const table of tables) {
    const sheetName = table.title.slice(0, 31).replace(/[\\/*?[\]:]/g, "_");
    const colCount = table.headers.length;

    // Row 0: Title bar (merged)
    const aoa: unknown[][] = [[table.title, ...Array(colCount - 1).fill("")]];
    // Row 1: Column headers
    aoa.push(table.headers);
    // Row 2+: Data rows
    for (const r of table.rows) aoa.push(r.map((v) => (v ?? "")));

    const ws = XLSX.utils.aoa_to_sheet(aoa);

    // Merge title row across all columns
    ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: colCount - 1 } }];

    // Apply styles cell-by-cell
    const totalRows = aoa.length;
    for (let R = 0; R < totalRows; R++) {
      for (let C = 0; C < colCount; C++) {
        const addr = XLSX.utils.encode_cell({ r: R, c: C });
        if (!ws[addr]) ws[addr] = { v: "", t: "s" };
        const cell = ws[addr];

        if (R === 0) {
          // Title row
          cell.s = { fill: titleFill, font: whiteFont, alignment: { horizontal: "center", vertical: "center" }, border: borders };
        } else if (R === 1) {
          // Header row
          cell.s = { fill: headerFill, font: headerFont, alignment: { horizontal: C === 0 ? "left" : "center", vertical: "center", wrapText: true }, border: borders };
        } else {
          // Data row — detect totals by checking if the label text contains "total" or "net"
          const label = String(aoa[R][0] ?? "").toLowerCase();
          const isTotal = label.includes("total") || label.startsWith("net ");
          const isAlt = (R - 2) % 2 === 1;

          const fill = isTotal ? totalFill : isAlt ? altRowFill : whiteFill;
          const font = isTotal ? totalFont : bodyFont;

          if (C === 0) {
            // Label column — left aligned
            cell.s = { fill, font, alignment: { horizontal: "left", vertical: "center" }, border: borders };
          } else {
            // Value column — right aligned with number format
            const isNum = typeof cell.v === "number" || (typeof cell.v === "string" && /^-?\d[\d,]*(\.\d+)?$/.test(cell.v));
            if (isNum && typeof cell.v === "string") {
              cell.v = parseFloat(cell.v.replace(/,/g, ""));
              cell.t = "n";
            }
            cell.s = {
              fill, font,
              alignment: { horizontal: "right", vertical: "center" },
              border: borders,
              ...(cell.t === "n" ? { numFmt } : {}),
            };
          }
        }
      }
    }

    // Auto column widths (min 12, max 28)
    ws["!cols"] = table.headers.map((h, ci) => {
      let maxLen = h.length;
      for (const row of table.rows) {
        const val = row[ci];
        const len = val != null ? String(val).length : 0;
        if (len > maxLen) maxLen = len;
      }
      return { wch: Math.max(12, Math.min(maxLen + 4, 28)) };
    });

    // First column (line item names) wider
    ws["!cols"][0] = { wch: Math.max(ws["!cols"][0].wch, 30) };

    // Row heights: title=28, header=22
    ws["!rows"] = [{ hpt: 28 }, { hpt: 22 }];

    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  }
  const buf: Uint8Array = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  return new Uint8Array(buf);
}

// ── PDF ──────────────────────────────────────────────────────────────

const C = {
  headerBg: "#0F172A",
  primary: "#6366F1",
  primaryLight: "#E0E7FF",
  textDark: "#1E293B",
  textMedium: "#475569",
  textLight: "#94A3B8",
  white: "#FFFFFF",
  altRow: "#F8FAFC",
};

async function tablesToPdf(tables: TableData[], stockSymbol: string, panelName: string, aiSummary?: AISummary | null) {
  const { jsPDF } = await import("jspdf");

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const mx = 12;
  const lineH = 6.5;
  const headerH = 20;

  const drawHeader = () => {
    doc.setFillColor(C.headerBg);
    doc.rect(0, 0, W, headerH, "F");
    doc.setFont("helvetica", "bold").setFontSize(14).setTextColor(C.white);
    doc.text(`${sanitizePdfText(stockSymbol, 20)} — ${sanitizePdfText(panelName, 60)}`, mx, 13);
    doc.setFontSize(8).setTextColor(C.textLight);
    doc.text(`Exported ${todayISO()}`, W - mx, 13, { align: "right" });
  };

  const drawFooter = (p: number) => {
    doc.setFontSize(7).setTextColor(C.textLight);
    doc.text("Portfolio App — Fundamental Analysis", mx, H - 6);
    doc.text(`Page ${p}`, W - mx, H - 6, { align: "right" });
  };

  let page = 1;
  drawHeader();
  let y = headerH + 6;

  // ── AI Summary card (if provided) ──────────────────────────────
  if (aiSummary) {
    const riskColor = aiSummary.riskLevel === "low" ? "#059669" : aiSummary.riskLevel === "high" ? "#DC2626" : "#f59e0b";
    const bulletCount = aiSummary.bullets.length + (aiSummary.actionHint ? 1 : 0);
    const cardH = 12 + bulletCount * 5 + 4;
    doc.setFillColor("#F8FAFC");
    doc.setDrawColor(riskColor);
    doc.setLineWidth(0.4);
    doc.roundedRect(mx, y, W - mx * 2, cardH, 2, 2, "FD");

    doc.setFont("helvetica", "bold").setFontSize(9).setTextColor(C.textDark);
    doc.text(sanitizePdfText(aiSummary.headline, 200), mx + 6, y + 7);

    doc.setFont("helvetica", "normal").setFontSize(7).setTextColor(riskColor);
    doc.text(`RISK: ${sanitizePdfText(aiSummary.riskLevel, 20).toUpperCase()}`, W - mx - 6, y + 7, { align: "right" });

    let bulletY = y + 13;
    doc.setFont("helvetica", "normal").setFontSize(7.5).setTextColor(C.textMedium);
    for (const b of aiSummary.bullets) {
      doc.text(`\u2022  ${sanitizePdfText(b, 300)}`, mx + 8, bulletY);
      bulletY += 5;
    }
    if (aiSummary.actionHint) {
      doc.setFont("helvetica", "bold").setFontSize(7.5).setTextColor(C.primary);
      doc.text(`\u27A4  ${sanitizePdfText(aiSummary.actionHint, 300)}`, mx + 8, bulletY);
    }

    y += cardH + 6;
  }

  for (const table of tables) {
    const colCount = table.headers.length;
    const availW = W - 2 * mx;
    const colW = availW / colCount;

    if (y + lineH * 2 > H - 14) { drawFooter(page); doc.addPage(); page++; drawHeader(); y = headerH + 6; }

    doc.setFont("helvetica", "bold").setFontSize(10).setTextColor(C.primary);
    doc.text(sanitizePdfText(table.title, 100), mx, y);
    y += 6;

    doc.setFillColor(C.primaryLight);
    doc.rect(mx, y - 4, availW, lineH, "F");
    doc.setFont("helvetica", "bold").setFontSize(7.5).setTextColor(C.textDark);
    for (let ci = 0; ci < colCount; ci++) doc.text(sanitizePdfText(table.headers[ci], 80), mx + ci * colW + 2, y, { maxWidth: colW - 4 });
    y += lineH;

    doc.setFont("helvetica", "normal").setFontSize(7);
    for (let ri = 0; ri < table.rows.length; ri++) {
      if (y + lineH > H - 14) { drawFooter(page); doc.addPage(); page++; drawHeader(); y = headerH + 6; }
      if (ri % 2 === 1) { doc.setFillColor(C.altRow); doc.rect(mx, y - 4, availW, lineH, "F"); }
      doc.setTextColor(C.textMedium);
      for (let ci = 0; ci < colCount; ci++) {
        doc.text(table.rows[ri][ci] != null ? sanitizePdfText(table.rows[ri][ci], 200) : "–", mx + ci * colW + 2, y, { maxWidth: colW - 4 });
      }
      y += lineH;
    }
    y += 6;
  }

  drawFooter(page);
  return doc;
}

// ── Native file share (expo-file-system v19 new API) ─────────────────

async function nativeShareBytes(bytes: Uint8Array, filename: string, mimeType: string) {
  const { Paths, File } = await import("expo-file-system");
  const Sharing = await import("expo-sharing");
  const file = new File(Paths.document, filename);
  file.write(bytes);
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: `Export ${filename}` });
  }
}

async function nativeShareString(content: string, filename: string, mimeType: string) {
  const { Paths, File } = await import("expo-file-system");
  const Sharing = await import("expo-sharing");
  const file = new File(Paths.document, filename);
  file.write(content);
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: `Export ${filename}` });
  }
}

function webDownloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ── Public API ──────────────────────────────────────────────────────

export async function exportCSV(tables: TableData[], stockSymbol: string, panelName: string) {
  const csv = tablesToCsv(tables);
  const filename = buildFilename(stockSymbol, panelName, "csv");
  if (Platform.OS === "web") {
    webDownloadBlob(new Blob([csv], { type: "text/csv" }), filename);
  } else {
    await nativeShareString(csv, filename, "text/csv");
  }
}

export async function exportExcel(tables: TableData[], stockSymbol: string, panelName: string) {
  const bytes = await tablesToXlsx(tables);
  const filename = buildFilename(stockSymbol, panelName, "xlsx");
  const mime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (Platform.OS === "web") {
    webDownloadBlob(new Blob([bytes as unknown as BlobPart], { type: mime }), filename);
  } else {
    await nativeShareBytes(bytes, filename, mime);
  }
}

export async function exportPDF(tables: TableData[], stockSymbol: string, panelName: string, aiSummary?: AISummary | null) {
  const doc = await tablesToPdf(tables, stockSymbol, panelName, aiSummary);
  const filename = buildFilename(stockSymbol, panelName, "pdf");
  if (Platform.OS === "web") {
    doc.save(filename);
  } else {
    // jsPDF output as arraybuffer → Uint8Array → write via new File API
    const buf = doc.output("arraybuffer");
    await nativeShareBytes(new Uint8Array(buf), filename, "application/pdf");
  }
}
