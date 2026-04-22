/**
 * useFinancialStatements — Two-phase async extraction pipeline.
 *
 * Phase 1: Fast upload — sends PDF, receives job_id immediately.
 * Phase 2: Poll extraction status until done/failed.
 */

import { useQueryClient } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Platform } from "react-native";

import { MAX_UPLOAD_BYTES } from "@/constants/layout";
import { extractErrorMessage } from "@/lib/errorHandling";
import {
    type AIUploadResult,
    type ExtractionStatusResponse,
    type UploadJobResponse,
    getExtractionStatus,
    uploadFinancialStatement,
} from "@/services/api/analytics";
import { INITIAL_STEPS, type ProcessingStep } from "../types";

/** Map extraction errors to user-facing messages with specific categories. */
function classifyExtractionError(err: unknown): string {
  if (err instanceof DOMException && err.name === "AbortError")
    return "Upload was cancelled.";

  const raw = extractErrorMessage(err, "");
  const lower = raw.toLowerCase();

  // Upload / network errors
  if (lower.includes("econnrefused") || lower.includes("enotfound"))
    return "Cannot reach the server. Please check if the backend is running.";
  if (lower.includes("network") || lower.includes("fetch"))
    return "Network error — check your internet connection and try again.";
  if (lower.includes("blob") || lower.includes("failed to fetch"))
    return "Failed to read file. Try downloading the PDF locally and re-uploading.";

  // File size / format
  if (lower.includes("413") || lower.includes("payload too large"))
    return "File too large. Maximum size is 50 MB.";
  if (lower.includes("422") || lower.includes("unprocessable"))
    return "Invalid PDF format. Ensure the file is not corrupted.";

  // Auth
  if (lower.includes("401") || lower.includes("unauthorized"))
    return "Session expired. Please sign in again and retry.";

  // Server-side extraction errors
  if (lower.includes("extraction timed out") || lower.includes("processing limit"))
    return "Extraction timed out on the server. The PDF may be too complex — try splitting it into smaller sections.";
  if (lower.includes("gemini") || lower.includes("api key") || lower.includes("gemini_api_key"))
    return "AI extraction requires a Gemini API key. Add GEMINI_API_KEY to your backend .env file or set it in Settings.";
  if (lower.includes("rate limit") || lower.includes("429") || lower.includes("quota"))
    return "AI service rate limit reached. Please wait a minute and try again.";
  if (lower.includes("503") || lower.includes("service unavailable"))
    return "AI extraction service is temporarily unavailable. Please try again in a few minutes.";
  if (lower.includes("500") || lower.includes("internal server"))
    return "Server error during extraction. Please try again shortly.";

  // Timeout distinctions
  if (lower.includes("upload timeout"))
    return "Upload timed out before the file reached the server. Check your connection and try again.";
  if (lower.includes("timeout") || lower.includes("timed out"))
    return "Request timed out. If the file is large, the extraction may still be running on the server.";

  // Parse / content errors
  if (lower.includes("scan") || lower.includes("image") || lower.includes("unreadable"))
    return "AI could not read this PDF. For best results, use digitally-generated (text-based) PDFs rather than scanned images.";
  if (lower.includes("table") || lower.includes("parse") || lower.includes("format"))
    return "Could not parse the financial tables. Ensure the PDF contains standard financial statements.";
  if (lower.includes("max retries"))
    return "Server is busy processing requests. Please wait a moment and try again.";

  return raw || "Upload failed. Please try a different file or try again later.";
}

/** Map backend stage to user-facing detail string. */
function stageToDetail(s: ExtractionStatusResponse): string {
  const { stage, pages_processed, total_pages, progress_percent } = s;
  switch (stage) {
    case "uploading": return "Preparing extraction…";
    case "extracting": {
      if (total_pages > 0 && pages_processed > 0)
        return `Extracting with AI… page ${pages_processed} of ${total_pages}`;
      if (progress_percent > 0)
        return `Extracting with AI… ${Math.round(progress_percent)}%`;
      return "Extracting with AI…";
    }
    case "saving": return "Validating and saving statements…";
    case "done": return "Extraction completed.";
    default: return `Processing… ${stage}`;
  }
}

export type GeminiModel = "gemini-2.5-flash" | "gemini-2.5-pro" | "gemini-2.5-pro-preview-03-25";

const POLL_INTERVAL_INITIAL = 2_000;
const POLL_INTERVAL_LONG = 4_000;
const POLL_SLOW_AFTER = 30_000; // switch to slower polling after 30s

export function useFinancialStatements(stockId: number, selectedModel: GeminiModel = "gemini-2.5-flash") {
  const queryClient = useQueryClient();
  const [processingSteps, setProcessingSteps] = useState<ProcessingStep[]>([]);
  const [uploadResult, setUploadResult] = useState<AIUploadResult | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollActiveRef = useRef(false);
  const lastUploadAtRef = useRef(0);
  const UPLOAD_COOLDOWN_MS = 1_000;

  // Cleanup all timers on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
      pollActiveRef.current = false;
    };
  }, []);

  const uploading = processingSteps.length > 0 &&
    processingSteps.some((s) => s.status === "running" || s.status === "pending");

  const allDone = processingSteps.length > 0 &&
    processingSteps.every((s) => s.status === "done" || s.status === "error");

  const updateStep = useCallback((key: ProcessingStep["key"], patch: Partial<ProcessingStep>) => {
    setProcessingSteps((prev) => prev.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  }, []);

  /** Stop polling and clear elapsed timer. */
  const stopTimers = useCallback(() => {
    pollActiveRef.current = false;
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    if (elapsedTimerRef.current) {
      clearInterval(elapsedTimerRef.current);
      elapsedTimerRef.current = null;
    }
  }, []);

  /** Poll extraction status until done/failed. */
  const startPolling = useCallback((jobId: number, startTime: number) => {
    pollActiveRef.current = true;

    const poll = async () => {
      if (!pollActiveRef.current) return;

      try {
        const s = await getExtractionStatus(jobId);

        if (!pollActiveRef.current) return;

        // Update UI with stage detail
        if (s.status === "done") {
          stopTimers();
          if (s.result) {
            setUploadResult(s.result);
            const totalItems = (s.result.statements ?? []).reduce(
              (sum, st) => sum + (st.line_items_count ?? 0), 0,
            );
            updateStep("extraction", {
              status: "done",
              detail: `${s.result.statements?.length ?? 0} statements, ${totalItems} items`,
            });
            queryClient.invalidateQueries({ queryKey: ["analysis-statements", stockId] });
          } else {
            updateStep("extraction", { status: "done", detail: "Extraction completed." });
            queryClient.invalidateQueries({ queryKey: ["analysis-statements", stockId] });
          }
          return;
        }

        if (s.status === "failed") {
          stopTimers();
          const errMsg = s.error_message || "Extraction failed on the server.";
          setUploadError(classifyExtractionError(new Error(errMsg)));
          updateStep("extraction", { status: "error", detail: errMsg });
          return;
        }

        // Still running — update progress detail
        updateStep("extraction", {
          status: "running",
          detail: stageToDetail(s),
        });

      } catch (pollErr: unknown) {
        // Transient poll failures are non-fatal — keep polling
        console.warn("Extraction status poll error:", pollErr);
      }

      // Schedule next poll (slower after 30s)
      if (pollActiveRef.current) {
        const elapsed = Date.now() - startTime;
        const interval = elapsed > POLL_SLOW_AFTER ? POLL_INTERVAL_LONG : POLL_INTERVAL_INITIAL;
        pollTimerRef.current = setTimeout(poll, interval);
      }
    };

    // First poll after a short delay
    pollTimerRef.current = setTimeout(poll, POLL_INTERVAL_INITIAL);
  }, [stopTimers, updateStep, queryClient, stockId]);

  /** Pick and upload a PDF — fast upload then poll for extraction status. */
  const handlePickAndUpload = useCallback(async () => {
    // Prevent rapid re-triggers and concurrent uploads
    const now = Date.now();
    if (now - lastUploadAtRef.current < UPLOAD_COOLDOWN_MS) return;
    if (uploading) return;
    lastUploadAtRef.current = now;
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

      // Reset state
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

      updateStep("extraction", { status: "running", detail: "Uploading file…" });

      // Elapsed time counter
      const startTime = Date.now();
      if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);
      elapsedTimerRef.current = setInterval(() => {
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        setProcessingSteps((prev) => {
          const step = prev.find((s) => s.key === "extraction");
          // Only update elapsed suffix if still in a running state
          if (!step || step.status !== "running") return prev;
          const base = step.detail?.replace(/\s*\(\d+s\)$/, "") ?? "Processing…";
          return prev.map((s) => s.key === "extraction" ? { ...s, detail: `${base} (${elapsed}s)` } : s);
        });
      }, 1000);

      // Setup abort controller
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      // ── Phase 1: Fast upload ──────────────────────────────────────
      let uploadRes: UploadJobResponse;
      try {
        uploadRes = await uploadFinancialStatement(
          stockId, payload, fileName, mimeType,
          { signal: controller.signal, force: true, model: selectedModel },
        );
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === "AbortError") throw err;
        // Classify upload-specific errors
        const msg = err instanceof Error ? err.message.toLowerCase() : "";
        if (msg.includes("timeout") || msg.includes("timed out")) {
          throw new Error("Upload timeout — the file could not be sent to the server. Check your connection and try again.", { cause: err });
        }
        throw err;
      }

      if (!uploadRes.job_id) {
        throw new Error("Server did not return a job ID. Please try again.");
      }

      // ── Phase 2: Poll for extraction progress ─────────────────────
      updateStep("extraction", {
        status: "running",
        detail: "File uploaded. Extraction is running…",
      });

      startPolling(uploadRes.job_id, startTime);

    } catch (err: unknown) {
      stopTimers();

      if (err instanceof DOMException && err.name === "AbortError") {
        setProcessingSteps([]);
        return;
      }

      console.error("Upload/extraction error:", err);
      const msg = classifyExtractionError(err);
      setUploadError(msg);
      setProcessingSteps((prev) => prev.map((s) =>
        s.status === "running" || s.status === "pending" ? { ...s, status: "error" as const, detail: msg } : s
      ));
    }
  }, [stockId, selectedModel, queryClient, updateStep, startPolling, stopTimers, uploading]);

  /** Cancel any in-flight upload or polling. */
  const cancelUpload = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    stopTimers();
    setProcessingSteps([]);
    setUploadError(null);
  }, [stopTimers]);

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
