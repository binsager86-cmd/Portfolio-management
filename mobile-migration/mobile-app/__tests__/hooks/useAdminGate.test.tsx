import { renderHook, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useAdminGate } from "@/hooks/useAdminGate";

// ── Mocks ─────────────────────────────────────────────────────────

const mockGetToken = jest.fn();

jest.mock("@/services/tokenStorage", () => ({
  getToken: (...args: any[]) => mockGetToken(...args),
}));

jest.mock("@/services/authStore", () => ({
  useAuthStore: jest.fn(),
}));

import { useAuthStore } from "@/services/authStore";

// ── Fetch mock ────────────────────────────────────────────────────

const mockFetch = jest.fn();
global.fetch = mockFetch;

// ── Helpers ───────────────────────────────────────────────────────

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("useAdminGate", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns loading initially when client is admin", async () => {
    (useAuthStore as unknown as jest.Mock).mockImplementation((selector: any) =>
      selector({ isAdmin: true }),
    );
    mockGetToken.mockResolvedValue("test-token");
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: { is_admin: true } }),
    });

    const { result } = renderHook(() => useAdminGate(), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(true);
  });

  it("allows access for admin role", async () => {
    (useAuthStore as unknown as jest.Mock).mockImplementation((selector: any) =>
      selector({ isAdmin: true }),
    );
    mockGetToken.mockResolvedValue("test-token");
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: { is_admin: true } }),
    });

    const { result } = renderHook(() => useAdminGate(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isAdmin).toBe(true);
  });

  it("blocks access for non-admin role", async () => {
    (useAuthStore as unknown as jest.Mock).mockImplementation((selector: any) =>
      selector({ isAdmin: true }),
    );
    mockGetToken.mockResolvedValue("test-token");
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: { is_admin: false } }),
    });

    const { result } = renderHook(() => useAdminGate(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isAdmin).toBe(false);
  });

  it("returns false when client is not admin (query disabled)", () => {
    (useAuthStore as unknown as jest.Mock).mockImplementation((selector: any) =>
      selector({ isAdmin: false }),
    );

    const { result } = renderHook(() => useAdminGate(), {
      wrapper: createWrapper(),
    });

    expect(result.current.isAdmin).toBe(false);
    expect(result.current.isLoading).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns false when fetch fails", async () => {
    (useAuthStore as unknown as jest.Mock).mockImplementation((selector: any) =>
      selector({ isAdmin: true }),
    );
    mockGetToken.mockResolvedValue("test-token");
    mockFetch.mockResolvedValue({ ok: false });

    const { result } = renderHook(() => useAdminGate(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isAdmin).toBe(false);
  });
});
