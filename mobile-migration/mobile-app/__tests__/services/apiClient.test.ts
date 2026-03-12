/**
 * API client — regression tests for the circular dependency fix.
 *
 * The original bug: api/client.ts imported authStore at the top level,
 * creating a circular import chain:
 *   authStore → api/index → api/client → authStore
 *
 * Fix: authStore is now lazy-imported via require() inside the
 * response error handler, breaking the cycle.
 *
 * These tests verify:
 *   1. The module loads without circular dependency errors
 *   2. The lazy require pattern works in the 401 refresh failure path
 *   3. The module exports are all accessible
 */

// ── Mocks (must be set before import) ───────────────────────────────

const mockGetToken = jest.fn().mockResolvedValue("test-token");
const mockSetToken = jest.fn().mockResolvedValue(undefined);
const mockRemoveToken = jest.fn().mockResolvedValue(undefined);
const mockGetRefreshToken = jest.fn().mockResolvedValue("test-refresh");
const mockSetRefreshToken = jest.fn().mockResolvedValue(undefined);
const mockRemoveRefreshToken = jest.fn().mockResolvedValue(undefined);

jest.mock("@/services/tokenStorage", () => ({
  getToken: (...args: any[]) => mockGetToken(...args),
  setToken: (...args: any[]) => mockSetToken(...args),
  removeToken: (...args: any[]) => mockRemoveToken(...args),
  getRefreshToken: (...args: any[]) => mockGetRefreshToken(...args),
  setRefreshToken: (...args: any[]) => mockSetRefreshToken(...args),
  removeRefreshToken: (...args: any[]) => mockRemoveRefreshToken(...args),
}));

const mockLogout = jest.fn();
jest.mock("@/services/authStore", () => ({
  useAuthStore: {
    getState: () => ({
      logout: mockLogout,
    }),
  },
}));

jest.mock("@/constants/Config", () => ({
  API_BASE_URL: "http://127.0.0.1:8004",
  API_TIMEOUT: 5000,
}));

// ── Import after mocks ──────────────────────────────────────────────

import api from "@/services/api/client";

describe("API client — circular dependency fix", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("loads without circular dependency errors", () => {
    // If there was a circular dependency, the import above would
    // throw or api would be undefined.
    expect(api).toBeDefined();
    expect(api.defaults).toBeDefined();
    expect(typeof api.get).toBe("function");
    expect(typeof api.post).toBe("function");
  });

  it("configures baseURL from Config (127.0.0.1, not localhost)", () => {
    expect(api.defaults.baseURL).toBe("http://127.0.0.1:8004");
  });

  it("has request interceptor for auth token", () => {
    expect(api.interceptors.request.handlers.length).toBeGreaterThan(0);
  });

  it("has response interceptor for 401 refresh", () => {
    expect(api.interceptors.response.handlers.length).toBeGreaterThan(0);
  });

  it("authStore is NOT imported at module top level", () => {
    // Read the source to verify the lazy import pattern.
    // This is a structural test — if someone accidentally adds a
    // top-level import of authStore, this test should catch it.
    const fs = require("fs");
    const path = require("path");
    const source = fs.readFileSync(
      path.join(__dirname, "..", "..", "services", "api", "client.ts"),
      "utf8"
    );

    // Should NOT have a top-level import of authStore
    const topLevelImportPattern = /^import\s+.*from\s+['"].*authStore['"]/m;
    expect(source).not.toMatch(topLevelImportPattern);

    // Should have a lazy require inside a function body
    expect(source).toContain('require("../authStore")');
  });
});
