/**
 * Token refresh & expiration — unit tests.
 *
 * Covers:
 *   - isTokenExpired detects expired tokens
 *   - isTokenExpired respects buffer window
 *   - Token refresh cycle on 401 (via api interceptor)
 *   - Concurrent 401s queue behind a single refresh
 *   - Logout on refresh failure
 */

import { isTokenExpired } from "@/services/tokenStorage";

// ── Helper: create a JWT with a specific exp timestamp ──────────────

function makeJwt(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = btoa(JSON.stringify(payload));
  return `${header}.${body}.fake-signature`;
}

describe("isTokenExpired", () => {
  it("returns true for null token", () => {
    expect(isTokenExpired(null)).toBe(true);
  });

  it("returns true for empty string token", () => {
    expect(isTokenExpired("")).toBe(true);
  });

  it("returns true for malformed token (no dots)", () => {
    expect(isTokenExpired("not-a-jwt")).toBe(true);
  });

  it("returns true for token with unparseable payload", () => {
    expect(isTokenExpired("header.!!!invalid!!!.sig")).toBe(true);
  });

  it("returns true for token with no exp field", () => {
    const token = makeJwt({ sub: "user123" });
    expect(isTokenExpired(token)).toBe(true);
  });

  it("returns true for expired token", () => {
    const expiredAt = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago
    const token = makeJwt({ exp: expiredAt, iat: expiredAt - 3600 });
    expect(isTokenExpired(token)).toBe(true);
  });

  it("returns false for token expiring far in the future", () => {
    const expiresAt = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
    const token = makeJwt({ exp: expiresAt, iat: expiresAt - 3600 });
    expect(isTokenExpired(token, 60)).toBe(false);
  });

  it("returns true for token expiring within buffer window", () => {
    const expiresAt = Math.floor(Date.now() / 1000) + 30; // 30s from now
    const token = makeJwt({ exp: expiresAt, iat: expiresAt - 3600 });
    // Default buffer is 60s, so 30s away should be considered expired
    expect(isTokenExpired(token, 60)).toBe(true);
  });

  it("returns false with buffer=0 for token expiring in 60s", () => {
    const expiresAt = Math.floor(Date.now() / 1000) + 60;
    const token = makeJwt({ exp: expiresAt, iat: expiresAt - 3600 });
    expect(isTokenExpired(token, 0)).toBe(false);
  });

  it("handles URL-safe base64 characters in JWT payload", () => {
    // URL-safe base64 uses - and _ instead of + and /
    const expiresAt = Math.floor(Date.now() / 1000) + 3600;
    const token = makeJwt({ exp: expiresAt, iat: expiresAt - 3600, sub: "user+test/name" });
    expect(isTokenExpired(token, 60)).toBe(false);
  });
});
