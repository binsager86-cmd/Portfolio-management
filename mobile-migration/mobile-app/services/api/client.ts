/**
 * Shared Axios instance with JWT auth & silent 401 refresh.
 */

import axios, {
    AxiosError,
    AxiosResponse,
    InternalAxiosRequestConfig,
} from "axios";

import { API_BASE_URL, API_TIMEOUT } from "@/constants/Config";
import {
    getRefreshToken,
    getToken,
    isTokenExpired,
    removeRefreshToken,
    removeToken,
    setRefreshToken,
    setToken,
} from "../tokenStorage";
import type { RefreshResponse } from "./types";

// ── Rate limiter — prevents request spam from UI rapid interactions ──

class RateLimiter {
  private timestamps: number[] = [];
  private readonly maxRequests: number;
  private readonly windowMs: number;

  constructor(maxRequests = 30, windowMs = 10_000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  check(): void {
    const now = Date.now();
    this.timestamps = this.timestamps.filter((t) => now - t < this.windowMs);
    if (this.timestamps.length >= this.maxRequests) {
      const waitSec = Math.ceil((this.windowMs - (now - this.timestamps[0])) / 1000);
      throw new Error(`Rate limited — too many requests. Please wait ${waitSec}s.`);
    }
    this.timestamps.push(now);
  }
}

const rateLimiter = new RateLimiter();

// ── Axios instance ──────────────────────────────────────────────────

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: API_TIMEOUT,
  headers: { "Content-Type": "application/json" },
});

// ── Proactive token refresh helper ──────────────────────────────────

let proactiveRefreshPromise: Promise<string | null> | null = null;

/**
 * If the access token is expired (or within 60 s of expiring), attempt
 * a silent refresh and return the new token.  Returns null if refresh
 * is unavailable or fails.  De-duplicates concurrent calls.
 */
async function ensureFreshToken(): Promise<string | null> {
  const token = await getToken();

  // Token is still valid — nothing to do
  if (!isTokenExpired(token)) return token;

  // No refresh token — can't refresh
  const refreshTok = await getRefreshToken();
  if (!refreshTok) return token; // return stale token; 401 interceptor will handle

  // De-duplicate: if a refresh is already in-flight, wait for it
  if (proactiveRefreshPromise) return proactiveRefreshPromise;

  proactiveRefreshPromise = (async () => {
    try {
      const { data } = await axios.post<RefreshResponse>(
        `${API_BASE_URL}/api/v1/auth/refresh`,
        { refresh_token: refreshTok },
        { headers: { "Content-Type": "application/json" } },
      );
      await setToken(data.access_token);
      if (data.refresh_token) await setRefreshToken(data.refresh_token);
      return data.access_token;
    } catch {
      // Proactive refresh failed — let the request go with the stale token;
      // the 401 response interceptor will handle full logout if needed.
      return token;
    } finally {
      proactiveRefreshPromise = null;
    }
  })();

  return proactiveRefreshPromise;
}

// ── Request interceptor: attach access token (with expiry check) ────

api.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  // Skip token logic for auth endpoints that don't need it
  const url = config.url ?? "";
  if (url.includes("/auth/login") || url.includes("/auth/register") || url.includes("/auth/refresh")) {
    return config;
  }

  // Rate-limit non-auth requests to prevent UI spam
  rateLimiter.check();

  const token = await ensureFreshToken();
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ── Response interceptor: silent refresh on 401 ─────────────────────

let isRefreshing = false;
let refreshSubscribers: Array<(token: string) => void> = [];

function subscribeTokenRefresh(cb: (token: string) => void) {
  refreshSubscribers.push(cb);
}

function onTokenRefreshed(newToken: string) {
  refreshSubscribers.forEach((cb) => cb(newToken));
  refreshSubscribers = [];
}

api.interceptors.response.use(
  (response: AxiosResponse) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    // Only attempt refresh on 401 and if we haven't retried yet
    if (error.response?.status !== 401 || originalRequest._retry) {
      return Promise.reject(error);
    }

    // Don't refresh on auth endpoints themselves
    const url = originalRequest.url ?? "";
    if (url.includes("/auth/login") || url.includes("/auth/refresh")) {
      return Promise.reject(error);
    }

    originalRequest._retry = true;

    if (!isRefreshing) {
      isRefreshing = true;
      try {
        const refreshTok = await getRefreshToken();
        if (!refreshTok) {
          throw new Error("No refresh token");
        }

        const { data } = await axios.post<RefreshResponse>(
          `${API_BASE_URL}/api/v1/auth/refresh`,
          { refresh_token: refreshTok },
          { headers: { "Content-Type": "application/json" } }
        );

        await setToken(data.access_token);
        if (data.refresh_token) {
          await setRefreshToken(data.refresh_token);
        }
        onTokenRefreshed(data.access_token);

        // Retry the original request with the new token
        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${data.access_token}`;
        }
        return api(originalRequest);
      } catch {
        // Refresh failed — clear tokens and reset auth state
        await removeToken();
        await removeRefreshToken();
        // Lazy import to break circular dependency
        const { useAuthStore } = require("../authStore");
        useAuthStore.getState().logout();
        refreshSubscribers = [];
        return Promise.reject(error);
      } finally {
        isRefreshing = false;
      }
    }

    // Another request is already refreshing — queue and wait
    return new Promise<AxiosResponse>((resolve) => {
      subscribeTokenRefresh((newToken: string) => {
        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
        }
        resolve(api(originalRequest));
      });
    });
  }
);

export default api;
