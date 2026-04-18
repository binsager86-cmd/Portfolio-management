/**
 * useFinancialStatements hook tests — covers the single-step extraction:
 *   - File picking + validation
 *   - Upload with 240s timeout + retry with backoff
 *   - Error classification (12+ categories)
 *   - Local cache (read/write/expiry)
 *   - Cancellation via AbortController
 *   - Processing step state transitions
 *   - Elapsed time progress tracking
 */

import { act, renderHook, waitFor } from "@testing-library/react-native";
import { Alert, Platform } from "react-native";
import { createWrapper } from "../helpers";

// ── Mocks — set up before importing the module ──────────────────────

const mockUpload = jest.fn();
const mockGetExtractionStatus = jest.fn();

jest.mock("@/services/api/analytics", () => ({
  uploadFinancialStatement: (...args: unknown[]) => mockUpload(...args),
  getExtractionStatus: (...args: unknown[]) => mockGetExtractionStatus(...args),
  AIUploadResult: {},
}));

// Mock expo-document-picker
const mockGetDocument = jest.fn();
jest.mock("expo-document-picker", () => ({
  getDocumentAsync: (...args: unknown[]) => mockGetDocument(...args),
}));

// Mock expo-crypto
jest.mock("expo-crypto", () => ({
  digestStringAsync: jest.fn().mockResolvedValue("mock-sha256-hash"),
  CryptoDigestAlgorithm: { SHA256: "SHA-256" },
}));

// Mock constants
jest.mock("@/constants/layout", () => ({
  MAX_UPLOAD_BYTES: 50 * 1024 * 1024,
}));

// Mock error handling
jest.mock("@/lib/errorHandling", () => ({
  extractErrorMessage: (err: unknown, fb: string) =>
    err instanceof Error ? err.message : fb,
}));

// Mock localStorage for cache
const mockStorage: Record<string, string> = {};
Object.defineProperty(globalThis, "localStorage", {
  value: {
    getItem: jest.fn((key: string) => mockStorage[key] ?? null),
    setItem: jest.fn((key: string, val: string) => { mockStorage[key] = val; }),
    removeItem: jest.fn((key: string) => { delete mockStorage[key]; }),
    clear: jest.fn(() => { Object.keys(mockStorage).forEach((k) => delete mockStorage[k]); }),
  },
  writable: true,
});

// Mock fetch for web blob conversion
const mockFetchFn = jest.fn();
globalThis.fetch = mockFetchFn as unknown as typeof fetch;

// ── Import after mocks ──────────────────────────────────────────────

import { useFinancialStatements } from "@/src/features/fundamental-analysis/hooks/useFinancialStatements";

// ── Fixtures ────────────────────────────────────────────────────────

const STOCK_ID = 42;

const MOCK_UPLOAD_RESULT = {
  message: "Extracted 2 statements",
  upload_id: "upl_123",
  statements: [
    {
      statement_id: 1,
      statement_type: "income",
      period_end_date: "2025-12-31",
      fiscal_year: 2025,
      line_items_count: 15,
      currency: "KWD",
    },
    {
      statement_id: 2,
      statement_type: "balance",
      period_end_date: "2025-12-31",
      fiscal_year: 2025,
      line_items_count: 20,
      currency: "KWD",
    },
  ],
  source_file: "annual_2025.pdf",
  pages_processed: 3,
  model: "gemini-2.5-flash",
  confidence: 0.95,
  cached: false,
  audit: {
    checks_total: 10,
    checks_passed: 9,
    checks_failed: 1,
    retries_used: 0,
    validation_corrections: 0,
    details: [],
  },
};

const MOCK_FILE = {
  uri: "blob:http://localhost/abc123",
  name: "annual_2025.pdf",
  size: 1024 * 100,
  mimeType: "application/pdf",
};

// ── Helpers ─────────────────────────────────────────────────────────

/**
 * Run handlePickAndUpload with fake-timer advancement so that
 * retry delays and elapsed-time intervals resolve instantly.
 */
async function pickAndUpload(result: { current: ReturnType<typeof useFinancialStatements> }) {
  await act(async () => {
    const p = result.current.handlePickAndUpload();
    // Advance past retry delays (3s) and interval ticks
    await jest.advanceTimersByTimeAsync(15_000);
    await p;
  });
}

// ── Setup / Teardown ────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  Object.keys(mockStorage).forEach((k) => delete mockStorage[k]);

  // Default: picker returns a valid file
  mockGetDocument.mockResolvedValue({
    canceled: false,
    assets: [MOCK_FILE],
  });

  // Default: upload returns job_id (two-phase flow)
  mockUpload.mockResolvedValue({ job_id: 123 });

  // Default: extraction polling returns done with result
  mockGetExtractionStatus.mockResolvedValue({ status: "done", result: MOCK_UPLOAD_RESULT });

  // Default: fetch blob conversion succeeds (web)
  mockFetchFn.mockResolvedValue({
    blob: () => Promise.resolve(new Blob(["pdf-content"], { type: "application/pdf" })),
  });

  // Platform.OS = "web" by default for cache/blob tests
  (Platform as any).OS = "web";
});

afterEach(() => {
  jest.useRealTimers();
  (Platform as any).OS = "web";
});

// ── Tests ───────────────────────────────────────────────────────────

describe("useFinancialStatements", () => {
  describe("initial state", () => {
    it("starts with empty processing steps and no errors", () => {
      const { result } = renderHook(() => useFinancialStatements(STOCK_ID), {
        wrapper: createWrapper(),
      });

      expect(result.current.processingSteps).toEqual([]);
      expect(result.current.uploadResult).toBeNull();
      expect(result.current.uploadError).toBeNull();
      expect(result.current.uploading).toBe(false);
      expect(result.current.allDone).toBe(false);
    });
  });

  describe("handlePickAndUpload — success flow", () => {
    it("picks file, uploads, and transitions single step to done", async () => {
      const { result } = renderHook(() => useFinancialStatements(STOCK_ID), {
        wrapper: createWrapper(),
      });

      await pickAndUpload(result);

      // Upload API called with correct stockId
      expect(mockUpload).toHaveBeenCalledTimes(1);
      expect(mockUpload).toHaveBeenCalledWith(
        STOCK_ID,
        expect.any(File), // web converts blob to File
        "annual_2025.pdf",
        "application/pdf",
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );

      // Result stored
      expect(result.current.uploadResult).toEqual(MOCK_UPLOAD_RESULT);
      expect(result.current.uploadError).toBeNull();

      // Single extraction step — done
      expect(result.current.processingSteps).toHaveLength(1);
      expect(result.current.processingSteps[0]).toMatchObject({
        key: "extraction",
        status: "done",
      });

      expect(result.current.allDone).toBe(true);
    });
  });

  describe("handlePickAndUpload — picker cancelled", () => {
    it("does nothing when user cancels file picker", async () => {
      mockGetDocument.mockResolvedValue({ canceled: true, assets: [] });

      const { result } = renderHook(() => useFinancialStatements(STOCK_ID), {
        wrapper: createWrapper(),
      });

      await pickAndUpload(result);

      expect(mockUpload).not.toHaveBeenCalled();
      expect(result.current.processingSteps).toEqual([]);
      expect(result.current.uploadError).toBeNull();
    });
  });

  describe("handlePickAndUpload — file too large", () => {
    it("shows alert and aborts when file exceeds 50 MB", async () => {
      const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
      mockGetDocument.mockResolvedValue({
        canceled: false,
        assets: [{ ...MOCK_FILE, size: 60 * 1024 * 1024 }],
      });

      const { result } = renderHook(() => useFinancialStatements(STOCK_ID), {
        wrapper: createWrapper(),
      });

      await pickAndUpload(result);

      expect(alertSpy).toHaveBeenCalledWith("File Too Large", "Maximum file size is 50 MB.");
      expect(mockUpload).not.toHaveBeenCalled();
      alertSpy.mockRestore();
    });
  });

  describe("handlePickAndUpload — upload errors", () => {
    it("classifies timeout errors with user-friendly message", async () => {
      mockUpload.mockRejectedValue(new Error("Upload timeout after 240 seconds"));

      const { result } = renderHook(() => useFinancialStatements(STOCK_ID), {
        wrapper: createWrapper(),
      });

      await pickAndUpload(result);

      expect(result.current.uploadError).toContain("timed out");
      expect(result.current.processingSteps.every((s) => s.status === "error")).toBe(true);
    });

    it("classifies 413 payload too large errors", async () => {
      mockUpload.mockRejectedValue(new Error("413 Payload too large"));

      const { result } = renderHook(() => useFinancialStatements(STOCK_ID), {
        wrapper: createWrapper(),
      });

      await pickAndUpload(result);

      expect(result.current.uploadError).toContain("File too large");
    });

    it("classifies 401 unauthorized errors", async () => {
      mockUpload.mockRejectedValue(new Error("401 Unauthorized"));

      const { result } = renderHook(() => useFinancialStatements(STOCK_ID), {
        wrapper: createWrapper(),
      });

      await pickAndUpload(result);

      expect(result.current.uploadError).toContain("Session expired");
    });

    it("classifies network errors", async () => {
      mockUpload.mockRejectedValue(new Error("Network Error"));

      const { result } = renderHook(() => useFinancialStatements(STOCK_ID), {
        wrapper: createWrapper(),
      });

      await pickAndUpload(result);

      expect(result.current.uploadError).toContain("Network error");
    });

    it("classifies 500 server errors", async () => {
      mockUpload.mockRejectedValue(new Error("500 Internal Server Error"));

      const { result } = renderHook(() => useFinancialStatements(STOCK_ID), {
        wrapper: createWrapper(),
      });

      await pickAndUpload(result);

      expect(result.current.uploadError).toContain("Server error");
    });

    it("classifies scan/image PDF errors", async () => {
      mockUpload.mockRejectedValue(new Error("PDF is scanned image, unreadable"));

      const { result } = renderHook(() => useFinancialStatements(STOCK_ID), {
        wrapper: createWrapper(),
      });

      await pickAndUpload(result);

      expect(result.current.uploadError).toContain("digitally-generated");
    });

    it("handles empty statements response as success with 0 items", async () => {
      mockGetExtractionStatus.mockResolvedValue({
        status: "done",
        result: { ...MOCK_UPLOAD_RESULT, statements: [] },
      });

      const { result } = renderHook(() => useFinancialStatements(STOCK_ID), {
        wrapper: createWrapper(),
      });

      await pickAndUpload(result);

      // Two-phase flow treats empty statements as a successful extraction
      expect(result.current.uploadError).toBeNull();
      expect(result.current.processingSteps[0]).toMatchObject({
        key: "extraction",
        status: "done",
      });
    });
  });

  describe("cancelUpload", () => {
    it("clears processing steps and errors on cancel", async () => {
      jest.useRealTimers();

      let rejectUpload: (err: Error) => void;
      mockUpload.mockImplementation(
        () => new Promise((_resolve, reject) => { rejectUpload = reject; }),
      );

      const { result } = renderHook(() => useFinancialStatements(STOCK_ID), {
        wrapper: createWrapper(),
      });

      // Start upload (don't await — it hangs)
      act(() => {
        result.current.handlePickAndUpload();
      });

      // Wait for mockUpload to actually be called before canceling
      await waitFor(() => {
        expect(mockUpload).toHaveBeenCalled();
      });

      // Cancel it
      act(() => {
        result.current.cancelUpload();
      });

      // Clean up the hanging promise
      await act(async () => {
        rejectUpload!(new DOMException("Aborted", "AbortError"));
      });

      expect(result.current.processingSteps).toEqual([]);
      expect(result.current.uploadError).toBeNull();
    });
  });

  describe("localStorage cache", () => {
    // localStorage caching was removed in the two-phase extraction refactor.
    // The hook now uses server-side job polling instead of client-side caching.
    it.skip("saves result to localStorage after successful upload (web)", async () => {
      // TODO: remove or replace with server-side cache test
    });

    it("does NOT cache on native platform", async () => {
      (Platform as any).OS = "ios";

      const { result } = renderHook(() => useFinancialStatements(STOCK_ID), {
        wrapper: createWrapper(),
      });

      // On native, file.uri is passed directly (no blob conversion)
      await pickAndUpload(result);

      // localStorage should not be called for caching on native
      const setCalls = (localStorage.setItem as jest.Mock).mock.calls.filter(
        ([key]: string[]) => key.startsWith("fa_statement_cache_"),
      );
      expect(setCalls).toHaveLength(0);
    });
  });

  describe("dismiss helpers", () => {
    it("dismissSteps clears processing steps", async () => {
      const { result } = renderHook(() => useFinancialStatements(STOCK_ID), {
        wrapper: createWrapper(),
      });

      await pickAndUpload(result);
      expect(result.current.processingSteps.length).toBeGreaterThan(0);

      act(() => {
        result.current.dismissSteps();
      });
      expect(result.current.processingSteps).toEqual([]);
    });

    it("dismissError clears upload error", async () => {
      mockUpload.mockRejectedValue(new Error("422 Unprocessable Entity"));

      const { result } = renderHook(() => useFinancialStatements(STOCK_ID), {
        wrapper: createWrapper(),
      });

      await pickAndUpload(result);
      expect(result.current.uploadError).toBeTruthy();

      act(() => {
        result.current.dismissError();
      });
      expect(result.current.uploadError).toBeNull();
    });

    it("dismissResult clears upload result", async () => {
      const { result } = renderHook(() => useFinancialStatements(STOCK_ID), {
        wrapper: createWrapper(),
      });

      await pickAndUpload(result);
      expect(result.current.uploadResult).toBeTruthy();

      act(() => {
        result.current.dismissResult();
      });
      expect(result.current.uploadResult).toBeNull();
    });
  });

  describe("classifyExtractionError coverage", () => {
    // Use only non-retryable errors here to avoid retry delay complexity.
    // Retryable errors (timeout, 500, 503, network) are tested in the
    // upload errors section above.
    const errorCases = [
      { input: "max retries exceeded", expected: "busy" },
      { input: "blob error", expected: "read file" },
      { input: "failed to fetch", expected: "network" },
      { input: "422 Unprocessable Entity", expected: "Invalid PDF" },
      { input: "ECONNREFUSED", expected: "reach the server" },
      { input: "table parse failed", expected: "parse" },
      { input: "GEMINI_API_KEY not set", expected: "Gemini API key" },
    ];

    errorCases.forEach(({ input, expected }) => {
      it(`maps "${input}" to message containing "${expected}"`, async () => {
        mockUpload.mockRejectedValue(new Error(input));

        const { result } = renderHook(() => useFinancialStatements(STOCK_ID), {
          wrapper: createWrapper(),
        });

        await pickAndUpload(result);

        expect(result.current.uploadError?.toLowerCase()).toContain(expected.toLowerCase());
      });
    });
  });

  describe("derived state flags", () => {
    it("uploading is true while steps are running", async () => {
      jest.useRealTimers();

      // Upload that never resolves until cleaned up
      let rejectUpload: (err: Error) => void;
      mockUpload.mockImplementation(
        () => new Promise((_resolve, reject) => { rejectUpload = reject; }),
      );

      const { result } = renderHook(() => useFinancialStatements(STOCK_ID), {
        wrapper: createWrapper(),
      });

      act(() => {
        result.current.handlePickAndUpload();
      });

      // Wait for mockUpload to be called (steps now set)
      await waitFor(() => {
        expect(mockUpload).toHaveBeenCalled();
      });

      expect(result.current.uploading).toBe(true);

      // Cleanup
      act(() => {
        result.current.cancelUpload();
      });

      await act(async () => {
        rejectUpload!(new DOMException("Aborted", "AbortError"));
      });
    });
  });
});
