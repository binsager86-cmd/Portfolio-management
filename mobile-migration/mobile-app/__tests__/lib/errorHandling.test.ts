/**
 * Error handling utilities — unit tests.
 *
 * Covers:
 *   - extractErrorMessage with Axios errors (status codes, network errors)
 *   - extractErrorMessage with FastAPI detail strings / validation arrays
 *   - User-friendly message mapping for common HTTP status codes
 *   - Fallback behavior for unknown errors
 *   - showErrorAlert cross-platform behavior
 */

import {
    extractErrorMessage,
    logError,
    showAlert,
} from "@/lib/errorHandling";
import { AxiosError, AxiosHeaders } from "axios";

// ── Helpers: create typed Axios errors ──────────────────────────────

function makeAxiosError(
  status: number,
  data: unknown,
  code?: string,
): AxiosError {
  const headers = new AxiosHeaders();
  const err = new AxiosError(
    `Request failed with status code ${status}`,
    code ?? "ERR_BAD_RESPONSE",
    { headers } as any,
    {},
    {
      status,
      statusText: "Error",
      headers: {},
      config: { headers } as any,
      data,
    },
  );
  return err;
}

function makeNetworkError(code: string): AxiosError {
  const headers = new AxiosHeaders();
  const err = new AxiosError(
    "Network Error",
    code,
    { headers } as any,
    {},
    undefined, // no response for network errors
  );
  return err;
}

describe("extractErrorMessage", () => {
  // ── FastAPI detail responses ───────────────────────────────────

  it("extracts FastAPI detail string from 422 response", () => {
    const err = makeAxiosError(422, { detail: "Invalid stock symbol" });
    expect(extractErrorMessage(err)).toBe("Invalid stock symbol");
  });

  it("extracts FastAPI validation error array", () => {
    const err = makeAxiosError(422, {
      detail: [
        { loc: ["body", "email"], msg: "field required" },
        { loc: ["body", "password"], msg: "too short" },
      ],
    });
    const msg = extractErrorMessage(err);
    expect(msg).toContain("body.email: field required");
    expect(msg).toContain("body.password: too short");
  });

  it("extracts message field from response data", () => {
    const err = makeAxiosError(400, { message: "Bad request details" });
    expect(extractErrorMessage(err)).toBe("Bad request details");
  });

  // ── User-friendly HTTP status mapping ──────────────────────────

  it("maps 401 to session expired message (without detail)", () => {
    const err = makeAxiosError(401, {});
    expect(extractErrorMessage(err)).toBe(
      "Your session has expired. Please sign in again.",
    );
  });

  it("maps 403 to permission denied message", () => {
    const err = makeAxiosError(403, {});
    expect(extractErrorMessage(err)).toBe(
      "You don't have permission to perform this action.",
    );
  });

  it("maps 404 to not found message", () => {
    const err = makeAxiosError(404, {});
    expect(extractErrorMessage(err)).toBe(
      "The requested resource was not found.",
    );
  });

  it("maps 422 without detail to friendly validation message", () => {
    const err = makeAxiosError(422, {});
    expect(extractErrorMessage(err)).toBe(
      "The data you entered is invalid. Please check and try again.",
    );
  });

  it("maps 429 to rate limit message", () => {
    const err = makeAxiosError(429, {});
    expect(extractErrorMessage(err)).toBe(
      "Too many requests. Please wait a moment and try again.",
    );
  });

  it("maps 500 to server error message", () => {
    const err = makeAxiosError(500, {});
    expect(extractErrorMessage(err)).toBe(
      "Something went wrong on the server. Please try again later.",
    );
  });

  // ── Network error mapping ─────────────────────────────────────

  it("maps ECONNREFUSED to connection error", () => {
    const err = makeNetworkError("ECONNREFUSED");
    expect(extractErrorMessage(err)).toBe(
      "Cannot connect to server. Please check your internet connection.",
    );
  });

  it("maps ERR_NETWORK to no internet message", () => {
    const err = makeNetworkError("ERR_NETWORK");
    expect(extractErrorMessage(err)).toBe(
      "No internet connection. Please check your network and try again.",
    );
  });

  it("maps ETIMEDOUT to timeout message", () => {
    const err = makeNetworkError("ETIMEDOUT");
    expect(extractErrorMessage(err)).toBe(
      "Request took too long. Please try again.",
    );
  });

  it("maps ERR_CANCELED to cancelled message", () => {
    const err = makeNetworkError("ERR_CANCELED");
    expect(extractErrorMessage(err)).toBe("The request was cancelled.");
  });

  // ── Priority: detail > friendly message ────────────────────────

  it("prefers FastAPI detail over friendly status message", () => {
    const err = makeAxiosError(422, { detail: "Duplicate ticker symbol" });
    expect(extractErrorMessage(err)).toBe("Duplicate ticker symbol");
  });

  it("prefers data.message over friendly status message", () => {
    const err = makeAxiosError(500, { message: "Database timeout on query" });
    expect(extractErrorMessage(err)).toBe("Database timeout on query");
  });

  // ── Non-Axios errors ──────────────────────────────────────────

  it("extracts message from standard Error", () => {
    expect(extractErrorMessage(new Error("File not found"))).toBe(
      "File not found",
    );
  });

  it("extracts from plain string error", () => {
    expect(extractErrorMessage("Something broke")).toBe("Something broke");
  });

  it("returns fallback for empty string", () => {
    expect(extractErrorMessage("")).toBe("An unexpected error occurred");
  });

  it("returns fallback for null", () => {
    expect(extractErrorMessage(null)).toBe("An unexpected error occurred");
  });

  it("returns fallback for undefined", () => {
    expect(extractErrorMessage(undefined)).toBe("An unexpected error occurred");
  });

  it("returns custom fallback when provided", () => {
    expect(extractErrorMessage(null, "Custom fallback")).toBe(
      "Custom fallback",
    );
  });

  it("returns fallback for unrecognized object", () => {
    expect(extractErrorMessage({ foo: "bar" })).toBe(
      "An unexpected error occurred",
    );
  });
});

describe("showAlert", () => {
  it("calls Alert.alert on native platform", () => {
    // In test environment, Platform.OS is not 'web', so Alert.alert is used.
    // Mock Alert.alert to verify the call.
    const { Alert } = require("react-native");
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation();

    showAlert("Error", "Something went wrong");

    expect(alertSpy).toHaveBeenCalledWith("Error", "Something went wrong");
    alertSpy.mockRestore();
  });
});

describe("logError", () => {
  it("logs structured error in dev mode", () => {
    const consoleSpy = jest.spyOn(console, "error").mockImplementation();
    logError("TestContext", new Error("test failure"));
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("[TestContext]"),
      "test failure",
    );
    consoleSpy.mockRestore();
  });

  it("includes HTTP status for Axios errors", () => {
    const consoleSpy = jest.spyOn(console, "error").mockImplementation();
    const err = makeAxiosError(404, { detail: "Not found" });
    logError("FetchData", err);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("[FetchData]"),
      "Not found",
      "(HTTP 404)",
      expect.stringContaining("code="),
    );
    consoleSpy.mockRestore();
  });
});
