/**
 * Lazy-loaded export wrapper — defers heavy jsPDF/xlsx imports until
 * the user actually triggers an export.
 *
 * Web:    dynamically imports the specific PDF module and invokes it.
 * Native: downloads the PDF from the backend API and opens the share sheet.
 *
 * This avoids pulling ~1.8 MB of jsPDF into the initial bundle.
 */

import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";

import type { MetricsCategoryData } from "@/lib/exportMetricsPdf";
import type { AISummary } from "@/lib/aiSummaryGenerator";
import type { GrowthEntry } from "@/lib/exportGrowthPdf";
import type { ValuationEntry, ValuationSummaryData } from "@/lib/exportValuationPdf";
import type { YieldCalcInput, YieldCalcResult } from "@/lib/exportYieldPdf";

export type ExportType = "growth" | "metrics" | "valuation" | "yield";

type GrowthExportPayload = {
  growth: Record<string, GrowthEntry[]>;
  labels: string[];
  stockSymbol: string;
};

type MetricsExportPayload = {
  categories: Record<string, MetricsCategoryData>;
  stockSymbol: string;
  totalMetrics: number;
  aiSummary?: AISummary | null;
};

type ValuationExportPayload = {
  summary: ValuationSummaryData;
  valuations: ValuationEntry[];
};

type YieldExportPayload = {
  input: YieldCalcInput;
  result: YieldCalcResult;
};

/**
 * Generate and present a PDF report for the given analysis type.
 *
 * @param data - The data payload expected by the specific PDF exporter.
 * @param type - Which report to generate.
 * @returns The result from the PDF exporter (web) or the local file URI (native).
 */
export const exportToPdf = async (
  data: unknown,
  type: ExportType,
): Promise<unknown> => {
  if (Platform.OS === "web") {
    switch (type) {
      case "growth": {
        const { exportGrowthPdf } = await import("@/lib/exportGrowthPdf");
        const payload = data as GrowthExportPayload;
        return exportGrowthPdf(payload.growth, payload.labels, payload.stockSymbol);
      }
      case "metrics": {
        const { exportMetricsPdf } = await import("@/lib/exportMetricsPdf");
        const payload = data as MetricsExportPayload;
        return exportMetricsPdf(payload.categories, payload.stockSymbol, payload.totalMetrics, payload.aiSummary);
      }
      case "valuation": {
        const { exportValuationPdf } = await import(
          "@/lib/exportValuationPdf"
        );
        const payload = data as ValuationExportPayload;
        return exportValuationPdf(payload.summary, payload.valuations);
      }
      case "yield": {
        const { exportYieldCalcPdf } = await import("@/lib/exportYieldPdf");
        const payload = data as YieldExportPayload;
        return exportYieldCalcPdf(payload.input, payload.result);
      }
    }
  }

  // Native: download from backend API and open share sheet
  const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? "";
  const { uri } = await FileSystem.downloadAsync(
    `${apiUrl}/api/v1/export/${type}`,
    FileSystem.Paths.cache.uri + `report_${type}.pdf`,
  );
  if (uri) await Sharing.shareAsync(uri);
  return uri;
};
