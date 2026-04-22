/**
 * News API service — communicates with the backend news endpoints.
 */

import { API_BASE_URL } from "@/constants/Config";
import { getToken } from "@/services/tokenStorage";
import type { NewsCategory, NewsFeedResponse, NewsHistoryResponse, NewsItem } from "./types";

const NEWS_API = `${API_BASE_URL}/api/v1/news`;

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// In-memory conditional-GET cache so the client can short-circuit unchanged
// /feed responses with HTTP 304. Keyed by request URL. Survives for the
// lifetime of the JS bundle (cleared on app reload), which is exactly the
// horizon React Query already trusts for `staleTime`.
type CachedResponse = { etag?: string; lastModified?: string; body: unknown };
const _conditionalCache = new Map<string, CachedResponse>();

async function fetchJson<T>(url: string): Promise<T> {
  const headers = await authHeaders();
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`News API error: ${res.status}`);
  return res.json();
}

/**
 * fetchJson variant that participates in conditional-GET (ETag /
 * Last-Modified). On a 304 response we return the previously cached body.
 */
async function fetchJsonConditional<T>(url: string): Promise<T> {
  const headers: Record<string, string> = await authHeaders();
  const cached = _conditionalCache.get(url);
  if (cached?.etag) headers["If-None-Match"] = cached.etag;
  if (cached?.lastModified) headers["If-Modified-Since"] = cached.lastModified;

  const res = await fetch(url, { headers });
  if (res.status === 304 && cached) {
    return cached.body as T;
  }
  if (!res.ok) throw new Error(`News API error: ${res.status}`);
  const body = (await res.json()) as T;
  const etag = res.headers.get("etag") ?? undefined;
  const lastModified = res.headers.get("last-modified") ?? undefined;
  if (etag || lastModified) {
    _conditionalCache.set(url, { etag, lastModified, body });
  }
  return body;
}

export interface NewsFeedParams {
  symbols?: string[];
  categories?: NewsCategory[];
  cursor?: string;
  limit?: number;
  lang?: string;
}

export interface NewsHistoryParams {
  symbols?: string[];
  categories?: NewsCategory[];
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
  lang?: string;
}

export const newsApi = {
  /** Fetch paginated news feed (cursor-based) */
  getFeed: async (params: NewsFeedParams): Promise<NewsFeedResponse> => {
    const qs = new URLSearchParams({ limit: (params.limit ?? 15).toString() });
    if (params.symbols?.length) qs.append("symbols", params.symbols.join(","));
    if (params.categories?.length) qs.append("categories", params.categories.join(","));
    if (params.cursor) qs.append("cursor", params.cursor);
    if (params.lang) qs.append("lang", params.lang);
    return fetchJsonConditional(`${NEWS_API}/feed?${qs}`);
  },

  /** Get single news item with full content + attachments */
  getItem: async (id: string): Promise<NewsItem> => {
    return fetchJson(`${NEWS_API}/item/${encodeURIComponent(id)}`);
  },

  /** Fetch stored news history with date-range and pagination */
  getHistory: async (params: NewsHistoryParams): Promise<NewsHistoryResponse> => {
    const qs = new URLSearchParams({
      limit: (params.limit ?? 20).toString(),
      page: (params.page ?? 1).toString(),
    });
    if (params.symbols?.length) qs.append("symbols", params.symbols.join(","));
    if (params.categories?.length) qs.append("categories", params.categories.join(","));
    if (params.dateFrom) qs.append("date_from", params.dateFrom);
    if (params.dateTo) qs.append("date_to", params.dateTo);
    if (params.lang) qs.append("lang", params.lang);
    return fetchJson(`${NEWS_API}/history?${qs}`);
  },

  /** List available sources */
  getSources: async (): Promise<{ sources: string[] }> => {
    return fetchJson(`${NEWS_API}/sources`);
  },

  /** Update push notification subscription */
  subscribe: async (payload: {
    symbols?: string[];
    categories?: NewsCategory[];
    pushEnabled: boolean;
  }): Promise<{ status: string }> => {
    const headers = await authHeaders();
    const res = await fetch(`${NEWS_API}/subscribe`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`Subscribe error: ${res.status}`);
    return res.json();
  },
};
