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

export type ExportType = "growth" | "metrics" | "valuation" | "yield";

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
        return exportGrowthPdf(data as Parameters<typeof exportGrowthPdf>[0]);
      }
      case "metrics": {
        const { exportMetricsPdf } = await import("@/lib/exportMetricsPdf");
        return exportMetricsPdf(data as Parameters<typeof exportMetricsPdf>[0]);
      }
      case "valuation": {
        const { exportValuationPdf } = await import(
          "@/lib/exportValuationPdf"
        );
        return exportValuationPdf(
          data as Parameters<typeof exportValuationPdf>[0],
        );
      }
      case "yield": {
        const { exportYieldCalcPdf } = await import("@/lib/exportYieldPdf");
        return exportYieldCalcPdf(
          data as Parameters<typeof exportYieldCalcPdf>[0],
        );
      }
    }
  }

  // Native: download from backend API and open share sheet
  const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? "";
  const { uri } = await FileSystem.downloadAsync(
    `${apiUrl}/api/v1/export/${type}`,
    FileSystem.cacheDirectory + `report_${type}.pdf`,
  );
  if (uri) await Sharing.shareAsync(uri);
  return uri;
};
