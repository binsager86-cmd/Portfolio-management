/**
 * Securities master endpoints.
 */

import api from "../client";
import type { SecurityRecord } from "../types";

/** List securities. */
export async function getSecurities(params?: {
  exchange?: string;
  status?: string;
  search?: string;
}): Promise<{ securities: SecurityRecord[]; count: number }> {
  const { data } = await api.get<{ status: string; data: { securities: SecurityRecord[]; count: number } }>(
    "/api/v1/securities",
    { params }
  );
  return data.data;
}

/** Create security. */
export async function createSecurity(payload: {
  canonical_ticker: string;
  exchange: string;
  display_name?: string;
  currency?: string;
  country?: string;
  sector?: string;
}): Promise<{ security_id: string; message: string }> {
  const { data } = await api.post<{ status: string; data: { security_id: string; message: string } }>(
    "/api/v1/securities",
    payload
  );
  return data.data;
}
