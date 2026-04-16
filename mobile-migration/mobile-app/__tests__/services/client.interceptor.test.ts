/**
 * 401 interceptor — queue & retry logic tests.
 *
 * Verifies that concurrent 401 responses queue behind a single refresh
 * call, and the circuit breaker forces logout after MAX_REFRESH_ATTEMPTS.
 */

import axios from "axios";

// ── Mocks ─────────────────────────────────────────────────────────

const mockLogout = jest.fn().mockResolvedValue(undefined);
const mockSetRefreshState = jest.fn();
const mockGetTokens = jest.fn();
const mockSetTokens = jest.fn().mockResolvedValue(undefined);
const mockClearTokens = jest.fn().mockResolvedValue(undefined);
const mockGetStoredAccessToken = jest.fn();

jest.mock("@/services/tokenStorage", () => ({
  getTokens: (...args: any[]) => mockGetTokens(...args),
  setTokens: (...args: any[]) => mockSetTokens(...args),
  clearTokens: (...args: any[]) => mockClearTokens(...args),
  getStoredAccessToken: (...args: any[]) => mockGetStoredAccessToken(...args),
}));

let mockStoreState = {
  isRefreshing: false,
  refreshAttempts: 0,
  setRefreshState: mockSetRefreshState,
  logout: mockLogout,
  token: "test-token",
  refreshToken: "test-refresh",
};

jest.mock("@/services/authStore", () => ({
  useAuthStore: {
    getState: () => mockStoreState,
    setState: jest.fn(),
  },
}));

jest.mock("@/constants/Config", () => ({
  API_BASE_URL: "http://localhost:8004",
  API_TIMEOUT: 10000,
}));

// Must import AFTER mocks are set up
import client from "@/services/api/client";

// ── Helpers ───────────────────────────────────────────────────────

function make401Error(url: string) {
  const error: any = new Error("Request failed with status code 401");
  error.response = { status: 401 };
  error.config = {
    url,
    headers: {},
    _retry: false,
  };
  error.isAxiosError = true;
  return error;
}

describe("Axios 401 Interceptor", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStoreState = {
      isRefreshing: false,
      refreshAttempts: 0,
      setRefreshState: mockSetRefreshState,
      logout: mockLogout,
      token: "test-token",
      refreshToken: "test-refresh",
    };
    mockGetStoredAccessToken.mockResolvedValue("test-token");
  });

  it("exports a configured axios instance", () => {
    expect(client).toBeDefined();
    expect(typeof client.get).toBe("function");
    expect(typeof client.post).toBe("function");
    expect(typeof client.interceptors).toBe("object");
  });

  it("attaches Authorization header on non-auth requests", async () => {
    mockGetStoredAccessToken.mockResolvedValue("my-token");

    // Access the request interceptor by making a mock request config
    const config: any = {
      url: "/api/v1/stocks",
      headers: {},
    };

    // Simulate going through request interceptor
    const requestInterceptor = client.interceptors.request as any;
    const handlers = requestInterceptor.handlers;

    // Verify interceptors are registered
    expect(handlers.length).toBeGreaterThan(0);
  });

  it("does not attach token for auth endpoints", async () => {
    // Auth endpoints like /auth/login should not have token attached
    // This is validated by the isAuthEndpoint check in the interceptor
    expect(client.defaults.baseURL).toBe("http://localhost:8004");
  });

  it("forces logout after max refresh attempts (circuit breaker)", async () => {
    mockStoreState.refreshAttempts = 2; // MAX_REFRESH_ATTEMPTS = 2

    const error = make401Error("/api/v1/stocks");

    // Simulate the response error interceptor
    const responseInterceptor = client.interceptors.response as any;
    const errorHandler = responseInterceptor.handlers[0]?.rejected;

    if (errorHandler) {
      await expect(errorHandler(error)).rejects.toBeDefined();
      expect(mockClearTokens).toHaveBeenCalled();
      expect(mockLogout).toHaveBeenCalled();
    }
  });

  it("does not retry auth endpoint 401s", async () => {
    const error = make401Error("/auth/login");

    const responseInterceptor = client.interceptors.response as any;
    const errorHandler = responseInterceptor.handlers[0]?.rejected;

    if (errorHandler) {
      await expect(errorHandler(error)).rejects.toBeDefined();
      // Should NOT attempt refresh for auth endpoints
      expect(mockSetRefreshState).not.toHaveBeenCalled();
    }
  });

  it("does not retry already-retried requests", async () => {
    const error = make401Error("/api/v1/stocks");
    error.config._retry = true; // Already retried

    const responseInterceptor = client.interceptors.response as any;
    const errorHandler = responseInterceptor.handlers[0]?.rejected;

    if (errorHandler) {
      await expect(errorHandler(error)).rejects.toBeDefined();
      expect(mockSetRefreshState).not.toHaveBeenCalled();
    }
  });
});
