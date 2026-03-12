/**
 * Auth endpoints: login, register, password, API keys, user info.
 */

import { z } from "zod";
import api from "./client";
import type { LoginResponse } from "./types";

export type { LoginResponse };

// ── Validation schemas (defense-in-depth) ───────────────────────────

const loginInputSchema = z.object({
  username: z.string().min(1).max(200).trim(),
  password: z.string().min(1).max(128),
});

const registerInputSchema = z.object({
  username: z.string().min(1).max(200).trim(),
  password: z.string().min(6).max(128),
  name: z.string().max(100).trim().optional(),
});

const changePasswordInputSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(6).max(128),
});

const apiKeyInputSchema = z.object({
  api_key: z.string()
    .min(1, "API key is required")
    .max(256, "API key too long")
    .regex(/^AIzaSy[A-Za-z0-9_-]{33}$/, "Invalid Gemini API key format"),
});

// ── API functions ───────────────────────────────────────────────────

/** Login using JSON body (v1). Returns JWT access + refresh tokens + user info. */
export async function login(
  username: string,
  password: string
): Promise<LoginResponse> {
  const validated = loginInputSchema.parse({ username, password });
  const { data } = await api.post<LoginResponse>("/api/v1/auth/login", {
    username: validated.username,
    password: validated.password,
  });
  return data;
}

/** Register new user. */
export async function register(
  username: string,
  password: string,
  name?: string
): Promise<LoginResponse> {
  const validated = registerInputSchema.parse({ username, password, name });
  const { data } = await api.post<LoginResponse>("/api/v1/auth/register", {
    username: validated.username,
    password: validated.password,
    name: validated.name,
  });
  return data;
}

/** Exchange a Google ID token for a JWT session. */
export async function googleSignIn(idToken: string): Promise<LoginResponse> {
  const { data } = await api.post<LoginResponse>("/api/v1/auth/google", {
    id_token: idToken,
  });
  return data;
}

/** Change password. */
export async function changePassword(
  currentPassword: string,
  newPassword: string
): Promise<{ message: string }> {
  const validated = changePasswordInputSchema.parse({ currentPassword, newPassword });
  const { data } = await api.put<{ status: string; data: { message: string } }>(
    "/api/v1/auth/change-password",
    { current_password: validated.currentPassword, new_password: validated.newPassword }
  );
  return data.data;
}

/** Get current user info. */
export async function getMe(): Promise<{ user_id: number; username: string; name: string }> {
  const { data } = await api.get<{ status: string; data: { user_id: number; username: string; name: string } }>("/api/v1/auth/me");
  return data.data;
}

/** Save user's Gemini API key. */
export async function saveApiKey(apiKey: string): Promise<{ message: string }> {
  const validated = apiKeyInputSchema.parse({ api_key: apiKey.trim() });
  const { data } = await api.put<{ status: string; data: { message: string } }>(
    "/api/v1/auth/api-key",
    { api_key: validated.api_key }
  );
  return data.data;
}

/** Get user's saved API key (masked). */
export async function getApiKey(): Promise<{ has_key: boolean; masked_key: string | null }> {
  const { data } = await api.get<{ status: string; data: { has_key: boolean; masked_key: string | null } }>(
    "/api/v1/auth/api-key"
  );
  return data.data;
}
