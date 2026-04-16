/**
 * useStatementManager — Business logic for the StatementsPanel.
 * Manages upload, import, online-fetch, attribution, and query orchestration.
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { Alert, Platform } from "react-native";

import { showErrorAlert } from "@/lib/errorHandling";
import {
    createStatement,
    fetchStatementsOnline,
} from "@/services/api";
import {
    aiAttributeExtraction,
    listStockPdfs,
    type SavedPdf,
} from "@/services/api/analytics";
import { useFinancialStatements, type GeminiModel } from "./useFinancialStatements";

import { useStatements } from "@/hooks/queries";
import { STMNT_META } from "../types";

// ── Public interface ────────────────────────────────────────────────

export interface StatementManagerState {
  /* Queries */
  statements: import("@/services/api").FinancialStatement[];
  isLoading: boolean;
  isFetching: boolean;
  refetch: () => void;
  savedPdfs: SavedPdf[];

  /* Type filter */
  typeFilter: string | undefined;
  setTypeFilter: (v: string | undefined) => void;

  /* AI model */
  selectedModel: GeminiModel;
  setSelectedModel: (m: GeminiModel) => void;

  /* Upload pipeline (delegated to useFinancialStatements) */
  uploading: boolean;
  processingSteps: ReturnType<typeof useFinancialStatements>["processingSteps"];
  uploadResult: ReturnType<typeof useFinancialStatements>["uploadResult"];
  uploadError: ReturnType<typeof useFinancialStatements>["uploadError"];
  allDone: boolean;
  handlePickAndUpload: () => void;
  dismissSteps: () => void;
  dismissError: () => void;
  dismissResult: () => void;

  /* Excel import */
  importing: boolean;
  importResult: string | null;
  setImportResult: (v: string | null) => void;
  handleImportExcel: () => void;

  /* Online fetch */
  fetchingOnline: boolean;
  onlineResult: string | null;
  setOnlineResult: (v: string | null) => void;
  handleFetchOnline: () => void;

  /* AI attribution */
  attributing: boolean;
  attributionDismissed: boolean;
  setAttributionDismissed: (v: boolean) => void;
  attributionResult: { message: string; corrections: number } | null;
  setAttributionResult: (v: { message: string; corrections: number } | null) => void;
  handleAttribution: () => void;

  stockId: number;
}

// ── Hook ────────────────────────────────────────────────────────────

export function useStatementManager(stockId: number): StatementManagerState {
  const queryClient = useQueryClient();

  const [typeFilter, setTypeFilter] = useState<string | undefined>("income");
  const [selectedModel, setSelectedModel] = useState<GeminiModel>("gemini-2.5-flash");

  // Statements query
  const { data, isLoading, refetch, isFetching } = useStatements(stockId, typeFilter);
  const statements = data?.statements ?? [];

  // Upload pipeline
  const {
    processingSteps, uploadResult, uploadError, uploading, allDone,
    handlePickAndUpload, dismissSteps, dismissError, dismissResult,
  } = useFinancialStatements(stockId, selectedModel);

  // Saved PDFs
  const { data: savedPdfs = [] } = useQuery({
    queryKey: ["stock-pdfs", stockId],
    queryFn: () => listStockPdfs(stockId),
    staleTime: 30_000,
  });

  // AI attribution
  const [attributing, setAttributing] = useState(false);
  const [attributionDismissed, setAttributionDismissed] = useState(false);
  const [attributionResult, setAttributionResult] = useState<{ message: string; corrections: number } | null>(null);

  const handleAttribution = useCallback(async () => {
    setAttributing(true);
    try {
      const res = await aiAttributeExtraction(stockId);
      setAttributionResult({ message: res.message, corrections: res.corrections_applied });
      if (res.corrections_applied > 0) {
        queryClient.invalidateQueries({ queryKey: ["analysis-statements", stockId] });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Attribution failed";
      showErrorAlert("AI Attribution", msg);
    } finally {
      setAttributing(false);
    }
  }, [stockId, queryClient]);

  // Excel import
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);

  const detectStatementType = useCallback((sheetName: string): string | null => {
    const s = sheetName.toLowerCase().trim();
    if (/balance|financial\s*position|bs\b/.test(s)) return "balance";
    if (/income|profit|loss|p\s*&\s*l|p&l|earnings/.test(s)) return "income";
    if (/cash\s*flow|cashflow|cf\b/.test(s)) return "cashflow";
    if (/equity|changes\s*in\s*equity/.test(s)) return "equity";
    return null;
  }, []);

  const processImportedAoa = useCallback(async (aoa: unknown[][], stmtType: string): Promise<number> => {
    const headers = (aoa[0] as (string | number | null)[]).map((h) => String(h ?? "").trim());
    const yearColumns: { colIdx: number; year: number; period: string }[] = [];

    for (let c = 1; c < headers.length; c++) {
      const h = headers[c];
      const yearMatch = h.match(/(\d{4})/);
      if (!yearMatch) continue;
      const year = parseInt(yearMatch[1], 10);
      if (year < 1900 || year > 2100) continue;
      const dateMatch = h.match(/(\d{4}-\d{2}-\d{2})/);
      const period = dateMatch ? dateMatch[1] : `${year}-12-31`;
      yearColumns.push({ colIdx: c, year, period });
    }

    if (yearColumns.length === 0) throw new Error("No year columns detected. Headers should contain years (e.g. FY2022, 2023, or 2023-12-31)");

    const dataRows = aoa.slice(1).filter((row) => {
      const name = String((row as unknown[])[0] ?? "").trim();
      return name.length > 0;
    });

    if (dataRows.length === 0) throw new Error("No data rows found");

    let totalCreated = 0;
    for (const yc of yearColumns) {
      const lineItems: { code: string; name: string; amount: number; is_total?: boolean }[] = [];
      for (let ri = 0; ri < dataRows.length; ri++) {
        const row = dataRows[ri] as (string | number | null)[];
        const name = String(row[0] ?? "").trim();
        const rawVal = row[yc.colIdx];
        let amount = 0;
        if (typeof rawVal === "number") {
          amount = rawVal;
        } else if (typeof rawVal === "string") {
          const cleaned = rawVal.replace(/[,$\s]/g, "");
          if (cleaned.startsWith("(") && cleaned.endsWith(")")) {
            amount = -parseFloat(cleaned.slice(1, -1)) || 0;
          } else {
            amount = parseFloat(cleaned) || 0;
          }
        }
        const code = name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
        const isTotal = name.toLowerCase().includes("total") || name.toLowerCase().startsWith("net ");
        lineItems.push({ code, name, amount, is_total: isTotal });
      }

      await createStatement(stockId, {
        statement_type: stmtType,
        fiscal_year: yc.year,
        period_end_date: yc.period,
        extracted_by: "excel_import",
        notes: "Imported from Excel",
        line_items: lineItems,
      });
      totalCreated++;
    }

    return totalCreated;
  }, [stockId]);

  const processWorkbook = useCallback(async (XLSX: typeof import("xlsx"), wb: import("xlsx").WorkBook) => {
    const results: string[] = [];
    let totalCreated = 0;

    for (const sheetName of wb.SheetNames) {
      const detectedType = detectStatementType(sheetName);
      const stmtType = detectedType ?? typeFilter ?? "income";
      const ws = wb.Sheets[sheetName];
      const aoa: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
      if (aoa.length < 2) {
        results.push(`"${sheetName}": skipped (no data rows)`);
        continue;
      }
      const created = await processImportedAoa(aoa, stmtType);
      totalCreated += created;
      results.push(`"${sheetName}" → ${stmtType} (${created} period(s))`);
    }

    queryClient.invalidateQueries({ queryKey: ["analysis-statements", stockId] });
    setImportResult(`Imported ${totalCreated} period(s) from ${results.length} sheet(s):\n${results.join("\n")}`);
  }, [detectStatementType, typeFilter, processImportedAoa, stockId, queryClient]);

  const handleImportExcel = useCallback(async () => {
    try {
      if (Platform.OS === "web") {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".xlsx,.xls,.csv";
        input.onchange = async () => {
          const file = input.files?.[0];
          if (!file) return;
          setImporting(true);
          setImportResult(null);
          try {
            const XLSX = await import("xlsx");
            const buf = await file.arrayBuffer();
            const wb = XLSX.read(buf, { type: "array" });
            await processWorkbook(XLSX, wb);
          } catch (err) {
            const msg = err instanceof Error ? err.message : "Import failed";
            setImportResult(`Error: ${msg}`);
          } finally {
            setImporting(false);
          }
        };
        input.click();
      } else {
        setImporting(true);
        setImportResult(null);
        try {
          const DocumentPicker = await import("expo-document-picker");
          const result = await DocumentPicker.getDocumentAsync({
            type: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.ms-excel", "text/csv"],
            copyToCacheDirectory: true,
          });
          if (result.canceled || !result.assets?.[0]) {
            setImporting(false);
            return;
          }
          const asset = result.assets[0];
          const FileSystem = await import("expo-file-system");
          const base64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: "base64" as const });
          const XLSX = await import("xlsx");
          const wb = XLSX.read(base64, { type: "base64" });
          await processWorkbook(XLSX, wb);
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Import failed";
          setImportResult(`Error: ${msg}`);
        } finally {
          setImporting(false);
        }
      }
    } catch (err) {
      setImporting(false);
      const msg = err instanceof Error ? err.message : "Import failed";
      setImportResult(`Error: ${msg}`);
    }
  }, [processWorkbook]);

  // Online fetch
  const [fetchingOnline, setFetchingOnline] = useState(false);
  const [onlineResult, setOnlineResult] = useState<string | null>(null);

  const handleFetchOnline = useCallback(async () => {
    setFetchingOnline(true);
    setOnlineResult(null);
    try {
      const res = await fetchStatementsOnline(stockId);
      setOnlineResult(res.message);
      queryClient.invalidateQueries({ queryKey: ["analysis-statements", stockId] });
      refetch();
    } catch (err: unknown) {
      setOnlineResult("Error: " + (err instanceof Error ? err.message : "Failed to fetch statements"));
    } finally {
      setFetchingOnline(false);
    }
  }, [stockId, queryClient, refetch]);

  // Auto-switch type filter on upload completion
  useEffect(() => {
    if (uploadResult && !uploading) {
      queryClient.invalidateQueries({ queryKey: ["stock-pdfs", stockId] });
      queryClient.invalidateQueries({ queryKey: ["analysis-statements", stockId] });
      const firstType = uploadResult.statements[0]?.statement_type;
      if (firstType) setTypeFilter(firstType);
    }
  }, [uploadResult, uploading, stockId, queryClient]);

  return {
    statements, isLoading, isFetching, refetch, savedPdfs,
    typeFilter, setTypeFilter,
    selectedModel, setSelectedModel,
    uploading, processingSteps, uploadResult, uploadError, allDone,
    handlePickAndUpload, dismissSteps, dismissError, dismissResult,
    importing, importResult, setImportResult, handleImportExcel,
    fetchingOnline, onlineResult, setOnlineResult, handleFetchOnline,
    attributing, attributionDismissed, setAttributionDismissed,
    attributionResult, setAttributionResult, handleAttribution,
    stockId,
  };
}
