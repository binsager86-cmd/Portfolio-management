/**
 * Shared Axios instance with JWT auth, promise-queue token refresh,
 * and circuit-breaker forced logout.
 *
 * Architecture:
 *   - Request interceptor: attaches access token, rate-limits
 *   - Response interceptor: reactive 401 handling with promise queue
 *   - Promise queue: concurrent 401s wait for a single refresh call,
 *     then all retry with the fresh token.
 *   - Circuit breaker: MAX_REFRESH_ATTEMPTS consecutive failures → forced logout.
 *   - No external mutex dependency.
 */

import axios, {
    type AxiosError,
    type InternalAxiosRequestConfig,
} from "axios";

import { API_BASE_URL, API_TIMEOUT } from "@/constants/Config";
import {
    clearTokens,
    getStoredAccessToken,
    getTokens,
    setTokens,
} from "@/services/tokenStorage";
import { useAuthStore } from "@/services/authStore";
import type { RefreshResponse } from "./types";

// ── Constants ───────────────────────────────────────────────────────

const MAX_REFRESH_ATTEMPTS = 2;
const RATE_LIMIT_WINDOW = 10_000; // 10s
const RATE_LIMIT_MAX = 30;

// ── Rate limiter ────────────────────────────────────────────────────

let requestTimestamps: number[] = [];

function isRateLimited(): boolean {
  const now = Date.now();
  requestTimestamps = requestTimestamps.filter((t) => now - t < RATE_LIMIT_WINDOW);
  if (requestTimestamps.length >= RATE_LIMIT_MAX) return true;
  requestTimestamps.push(now);
  return false;
}

// ── Promise queue for concurrent 401s ───────────────────────────────

type QueueItem = {
  resolve: (token: string) => void;
  reject: (error: Error) => void;
};
let failedQueue: QueueItem[] = [];

// Module-level atomic lock guarding refresh-state initialization. The
// Zustand `isRefreshing` flag is the queue gate, but it is set inside
// an async block; under high concurrency two 401s can both pass the
// `if (isRefreshing)` check before either calls `setRefreshState(true)`.
// This boolean is set synchronously before any async work, closing
// that race window.
let refreshInFlight = false;

function processQueue(error: Error | null, token: string | null = null): void {
  failedQueue.forEach((prom) =>
    error ? prom.reject(error) : prom.resolve(token!),
  );
  failedQueue = [];
}

// ── Helpers ─────────────────────────────────────────────────────────

function isAuthEndpoint(url: string): boolean {
  return (
    url.includes("/auth/login") ||
    url.includes("/auth/register") ||
    url.includes("/auth/refresh")
  );
}

// ── Axios instance ──────────────────────────────────────────────────

const client = axios.create({
  baseURL: API_BASE_URL,
  timeout: API_TIMEOUT,
  headers: { "Content-Type": "application/json" },
});

// ── Request interceptor: attach access token + rate-limit ───────────

client.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    if (isRateLimited()) {
      throw new Error("Too many requests. Please wait a moment.");
    }

    const url = config.url ?? "";
    if (!isAuthEndpoint(url)) {
      const token = await getStoredAccessToken();
      if (token && config.headers) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }

    return config;
  },
  (error) => Promise.reject(error),
);

// ── Response interceptor: promise-queued 401 refresh ────────────────

client.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    if (!original || error.response?.status !== 401 || original._retry) {
      return Promise.reject(error);
    }

    // Don't retry auth endpoints (login/register/refresh failures are final)
    if (isAuthEndpoint(original.url ?? "")) {
      return Promise.reject(error);
    }

    original._retry = true;

    const { isRefreshing, refreshAttempts, setRefreshState } =
      useAuthStore.getState();

    // ── Circuit breaker ──
    if (refreshAttempts >= MAX_REFRESH_ATTEMPTS) {
      await clearTokens();
      setRefreshState(false, 0);
      await useAuthStore.getState().logout();
      return Promise.reject(
        new Error("Session expired. Please login again."),
      );
    }

    // ── Queue behind in-flight refresh ──
    if (isRefreshing || refreshInFlight) {
      return new Promise((resolve, reject) => {
        failedQueue.push({
          resolve: (token) => {
            if (original.headers) {
              original.headers.Authorization = `Bearer ${token}`;
            }
            resolve(client(original));
          },
          reject,
        });
      });
    }

    // ── Perform refresh ──
    refreshInFlight = true;
    setRefreshState(true, refreshAttempts + 1);

    try {
      const { refresh } = await getTokens();
      if (!refresh) throw new Error("No refresh token available.");

      const { data } = await axios.post<RefreshResponse>(
        `${API_BASE_URL}/api/v1/auth/refresh`,
        { refresh_token: refresh },
        { headers: { "Content-Type": "application/json" } },
      );

      // Persist new tokens
      await setTokens(
        data.access_token,
        data.refresh_token ?? refresh,
        data.expires_in,
      );

      // Update store state (without triggering full re-login)
      useAuthStore.setState({
        token: data.access_token,
        refreshToken: data.refresh_token ?? refresh,
      });

      processQueue(null, data.access_token);
      if (original.headers) {
        original.headers.Authorization = `Bearer ${data.access_token}`;
      }
      setRefreshState(false, 0);
      refreshInFlight = false;
      return client(original);
    } catch (refreshError) {
      processQueue(refreshError as Error, null);
      await clearTokens();
      setRefreshState(false, 0);
      refreshInFlight = false;
      await useAuthStore.getState().logout();
      return Promise.reject(refreshError);
    }
  },
);

// ── Generic retry for network / idempotent errors ───────────────────
import axiosRetry from "axios-retry";

axiosRetry(client, {
  retries: 3,
  retryCondition: (error) => axiosRetry.isNetworkOrIdempotentRequestError(error),
  retryDelay: axiosRetry.exponentialDelay,
  onRetry: (count, error) => {
    if (__DEV__) console.warn(`[API Retry] Attempt ${count} for ${error.config?.url}`);
  },
});

export default client;
