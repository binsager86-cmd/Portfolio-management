/**
 * useFinancialStatements — Single-step AI Vision extraction.
 *
 * Mirrors the Streamlit approach: upload PDF → AI Vision extracts all
 * statements → results saved to DB in one pass. No separate
 * validation/placement steps.
 */

import { useQueryClient } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Platform } from "react-native";

import { MAX_UPLOAD_BYTES } from "@/constants/layout";
import { extractErrorMessage } from "@/lib/errorHandling";
import {
  type AIUploadResult,
  uploadFinancialStatement,
} from "@/services/api/analytics";
import { INITIAL_STEPS, type ProcessingStep } from "../types";

/** Map raw extraction errors to actionable user-facing messages. */
function classifyExtractionError(err: unknown): string {
  if (err instanceof DOMException && err.name === "AbortError")
    return "Upload was cancelled.";

  const raw = extractErrorMessage(err, "");
  const lower = raw.toLowerCase();

  if (lower.includes("timeout") || lower.includes("timed out"))
    return "Extraction timed out — the file may be too large or complex. Try splitting it into smaller sections.";
  if (lower.includes("max retries"))
    return "Server is busy processing requests. Please wait a moment and try again.";
  if (lower.includes("blob") || lower.includes("failed to fetch"))
    return "Failed to read file. Try downloading the PDF locally and re-uploading.";
  if (lower.includes("413") || lower.includes("payload too large"))
    return "File too large. Maximum size is 50 MB.";
  if (lower.includes("422") || lower.includes("unprocessable"))
    return "Invalid PDF format. Ensure the file is not corrupted.";
  if (lower.includes("401") || lower.includes("unauthorized"))
    return "Session expired. Please sign in again and retry.";
  if (lower.includes("503") || lower.includes("service unavailable"))
    return "AI extraction service is temporarily unavailable. Please try again in a few minutes.";
  if (lower.includes("500") || lower.includes("internal server"))
    return "Server error during extraction. The team has been notified — please try again shortly.";
  if (lower.includes("scan") || lower.includes("image") || lower.includes("unreadable"))
    return "AI could not read this PDF. For best results, use digitally-generated (text-based) PDFs rather than scanned images.";
  if (lower.includes("table") || lower.includes("parse") || lower.includes("format"))
    return "Could not parse the financial tables. Ensure the PDF contains standard financial statements.";
  if (lower.includes("econnrefused") || lower.includes("enotfound"))
    return "Cannot reach the server. Please check if the backend is running.";
  if (lower.includes("api key") || lower.includes("api_key") || lower.includes("gemini"))
    return "AI extraction requires a Gemini API key. Add GEMINI_API_KEY to your backend .env file or set it in Settings.";
  if (lower.includes("network") || lower.includes("fetch"))
    return "Network error — check your internet connection and try again.";

  return raw || "Upload failed. Please try a different file or try again later.";
}

export function useFinancialStatements(stockId: number) {
  const queryClient = useQueryClient();
  const [processingSteps, setProcessingSteps] = useState<ProcessingStep[]>([]);
  const [uploadResult, setUploadResult] = useState<AIUploadResult | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Abort any in-flight upload on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);
    };
  }, []);

  const uploading = processingSteps.length > 0 &&
    processingSteps.some((s) => s.status === "running" || s.status === "pending");

  const allDone = processingSteps.length > 0 &&
    processingSteps.every((s) => s.status === "done" || s.status === "error");

  const updateStep = useCallback((key: ProcessingStep["key"], patch: Partial<ProcessingStep>) => {
    setProcessingSteps((prev) => prev.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  }, []);

  /** Pick and upload a PDF — single-step extraction like Streamlit. */
  const handlePickAndUpload = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "application/pdf",
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) return;

      const file = result.assets[0];
      if (!file.uri || !file.name) {
        setUploadError("Invalid file selected.");
        return;
      }

      if (file.size && file.size > MAX_UPLOAD_BYTES) {
        Alert.alert("File Too Large", "Maximum file size is 50 MB.");
        return;
      }

      setProcessingSteps(INITIAL_STEPS.map((s) => ({ ...s })));
      setUploadError(null);
      setUploadResult(null);

      const fileName = file.name;
      const mimeType = file.mimeType || "application/pdf";

      // Web: convert Blob URI to File object
      let payload: File | Blob | string = file.uri;
      if (Platform.OS === "web" && file.uri) {
        try {
          const response = await fetch(file.uri);
          const blob = await response.blob();
          payload = new File([blob], fileName, { type: mimeType });
        } catch (fetchErr) {
          console.error("Failed to convert Blob:", fetchErr);
          setUploadError("Failed to read file on Web. Please try downloading the PDF and re-uploading.");
          return;
        }
      }

      // Single-step extraction — mirrors Streamlit's upload_full_report
      updateStep("extraction", { status: "running", detail: "Uploading…" });

      // Elapsed time counter — gives users confidence the extraction is progressing
      const startTime = Date.now();
      if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);
      elapsedTimerRef.current = setInterval(() => {
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        updateStep("extraction", { detail: `Processing… ${elapsed}s` });
      }, 1000);

      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      // Retry-enabled upload with exponential backoff (matches Streamlit's
      // MAX_RETRIES approach for transient failures).
      const MAX_UPLOAD_RETRIES = 2;
      const UPLOAD_TIMEOUT_MS = 240_000;
      let res: AIUploadResult | null = null;
      let lastError: unknown = null;

      for (let attempt = 1; attempt <= MAX_UPLOAD_RETRIES; attempt++) {
        try {
          if (controller.signal.aborted) break;

          if (attempt > 1) {
            updateStep("extraction", {
              status: "running",
              detail: `Retry ${attempt - 1}/${MAX_UPLOAD_RETRIES - 1}…`,
            });
          }

          const uploadPromise = uploadFinancialStatement(
            stockId, payload, fileName, mimeType, { signal: controller.signal, force: true },
          );
          const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("Upload timeout after 240 seconds")), UPLOAD_TIMEOUT_MS),
          );

          res = await Promise.race([uploadPromise, timeoutPromise]);
          lastError = null;
          break; // success
        } catch (err: unknown) {
          lastError = err;
          // Don't retry on user cancellation
          if (err instanceof DOMException && err.name === "AbortError") throw err;

          const msg = err instanceof Error ? err.message.toLowerCase() : "";
          const isRetryable =
            msg.includes("timeout") ||
            msg.includes("timed out") ||
            msg.includes("500") ||
            msg.includes("503") ||
            msg.includes("502") ||
            msg.includes("network") ||
            msg.includes("econnreset");

          if (!isRetryable || attempt === MAX_UPLOAD_RETRIES) throw err;

          // Exponential backoff: 3s, 6s
          const delay = 3000 * attempt;
          console.warn(`Attempt ${attempt} failed (${msg}), retrying in ${delay}ms…`);
          await new Promise((r) => setTimeout(r, delay));
        }
      }

      if (!res) throw lastError ?? new Error("Upload failed after retries");

      // Stop elapsed timer
      if (elapsedTimerRef.current) {
        clearInterval(elapsedTimerRef.current);
        elapsedTimerRef.current = null;
      }

      if (!res.statements || res.statements.length === 0) {
        updateStep("extraction", { status: "error", detail: "No statements found" });
        setUploadError(
          res.message
            ? `Extraction returned no statements: ${res.message}`
            : "AI could not find financial tables in this document. Ensure the PDF contains standard financial statements (income statement, balance sheet, or cash flow).",
        );
        return;
      }

      setUploadResult(res);

      const totalItems = res.statements.reduce((s, st) => s + st.line_items_count, 0);
      updateStep("extraction", { status: "done", detail: `${res.statements.length} statements, ${totalItems} items` });
      queryClient.invalidateQueries({ queryKey: ["analysis-statements", stockId] });

    } catch (err: unknown) {
      // Stop elapsed timer on error
      if (elapsedTimerRef.current) {
        clearInterval(elapsedTimerRef.current);
        elapsedTimerRef.current = null;
      }

      if (err instanceof DOMException && err.name === "AbortError") {
        setProcessingSteps([]);
        return;
      }

      console.error("Extraction error:", err);
      const raw = err instanceof Error ? err.message : "";
      const msg = raw === "Upload timeout after 240 seconds"
        ? "Upload timed out. The file may be too large or complex — try splitting it into smaller sections."
        : classifyExtractionError(err);

      setUploadError(msg);
      setProcessingSteps((prev) => prev.map((s) =>
        s.status === "running" || s.status === "pending" ? { ...s, status: "error" as const, detail: msg } : s
      ));
    }
  }, [stockId, queryClient, updateStep]);

  /** Cancel any in-flight upload. */
  const cancelUpload = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    if (elapsedTimerRef.current) {
      clearInterval(elapsedTimerRef.current);
      elapsedTimerRef.current = null;
    }
    setProcessingSteps([]);
    setUploadError(null);
  }, []);

  const dismissSteps = useCallback(() => setProcessingSteps([]), []);
  const dismissError = useCallback(() => setUploadError(null), []);
  const dismissResult = useCallback(() => setUploadResult(null), []);

  return {
    processingSteps,
    uploadResult,
    uploadError,
    uploading,
    allDone,
    handlePickAndUpload,
    cancelUpload,
    dismissSteps,
    dismissError,
    dismissResult,
  };
}
