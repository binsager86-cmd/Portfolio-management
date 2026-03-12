/**
 * Export helpers for Fundamental Analysis panels.
 *
 * - exportCSV()   → .csv file (share / download)
 * - exportExcel() → .xlsx file via SheetJS
 * - exportPDF()   → .pdf file via jsPDF
 *
 * All work cross-platform (web download, native share sheet).
 */

import { todayISO } from "@/lib/dateUtils";
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

// ── Excel (xlsx) ─────────────────────────────────────────────────────

async function tablesToXlsx(tables: TableData[]): Promise<Uint8Array> {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  for (const table of tables) {
    const sheetName = table.title.slice(0, 31).replace(/[\\/*?[\]:]/g, "_");
    const aoa = [table.headers, ...table.rows.map((r) => r.map((v) => (v ?? "")))];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
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

async function tablesToPdf(tables: TableData[], stockSymbol: string, panelName: string) {
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
    doc.text(`${stockSymbol} — ${panelName}`, mx, 13);
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

  for (const table of tables) {
    const colCount = table.headers.length;
    const availW = W - 2 * mx;
    const colW = availW / colCount;

    if (y + lineH * 2 > H - 14) { drawFooter(page); doc.addPage(); page++; drawHeader(); y = headerH + 6; }

    doc.setFont("helvetica", "bold").setFontSize(10).setTextColor(C.primary);
    doc.text(table.title, mx, y);
    y += 6;

    doc.setFillColor(C.primaryLight);
    doc.rect(mx, y - 4, availW, lineH, "F");
    doc.setFont("helvetica", "bold").setFontSize(7.5).setTextColor(C.textDark);
    for (let ci = 0; ci < colCount; ci++) doc.text(table.headers[ci], mx + ci * colW + 2, y, { maxWidth: colW - 4 });
    y += lineH;

    doc.setFont("helvetica", "normal").setFontSize(7);
    for (let ri = 0; ri < table.rows.length; ri++) {
      if (y + lineH > H - 14) { drawFooter(page); doc.addPage(); page++; drawHeader(); y = headerH + 6; }
      if (ri % 2 === 1) { doc.setFillColor(C.altRow); doc.rect(mx, y - 4, availW, lineH, "F"); }
      doc.setTextColor(C.textMedium);
      for (let ci = 0; ci < colCount; ci++) {
        doc.text(table.rows[ri][ci] != null ? String(table.rows[ri][ci]) : "–", mx + ci * colW + 2, y, { maxWidth: colW - 4 });
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
  a.click();
  URL.revokeObjectURL(url);
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

export async function exportPDF(tables: TableData[], stockSymbol: string, panelName: string) {
  const doc = await tablesToPdf(tables, stockSymbol, panelName);
  const filename = buildFilename(stockSymbol, panelName, "pdf");
  if (Platform.OS === "web") {
    doc.save(filename);
  } else {
    // jsPDF output as arraybuffer → Uint8Array → write via new File API
    const buf = doc.output("arraybuffer");
    await nativeShareBytes(new Uint8Array(buf), filename, "application/pdf");
  }
}
