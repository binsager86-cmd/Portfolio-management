import { renderHook } from "@testing-library/react-native";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAuthCacheSync } from "@/hooks/useAuthCacheSync";

// ── Mocks ─────────────────────────────────────────────────────────

const mockSubscribe = jest.fn();

jest.mock("@/services/authStore", () => ({
  useAuthStore: {
    subscribe: (...args: any[]) => mockSubscribe(...args),
  },
}));

// ── Helpers ───────────────────────────────────────────────────────

function createQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
}

function createWrapper(queryClient: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("useAuthCacheSync", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("subscribes to auth store on mount", () => {
    mockSubscribe.mockReturnValue(jest.fn());
    const qc = createQueryClient();

    renderHook(() => useAuthCacheSync(), { wrapper: createWrapper(qc) });

    expect(mockSubscribe).toHaveBeenCalledTimes(1);
    expect(typeof mockSubscribe.mock.calls[0][0]).toBe("function");
  });

  it("clears query cache on logout (token → null)", () => {
    mockSubscribe.mockImplementation((callback: any) => {
      // Simulate logout: prevState had token, new state has no token
      callback({ token: null }, { token: "old-token" });
      return jest.fn();
    });

    const qc = createQueryClient();
    const clearSpy = jest.spyOn(qc, "clear");

    renderHook(() => useAuthCacheSync(), { wrapper: createWrapper(qc) });

    expect(clearSpy).toHaveBeenCalledTimes(1);
  });

  it("invalidates queries on login (null → token)", () => {
    mockSubscribe.mockImplementation((callback: any) => {
      // Simulate login: prevState had no token, new state has token
      callback({ token: "new-token" }, { token: null });
      return jest.fn();
    });

    const qc = createQueryClient();
    const invalidateSpy = jest.spyOn(qc, "invalidateQueries");

    renderHook(() => useAuthCacheSync(), { wrapper: createWrapper(qc) });

    expect(invalidateSpy).toHaveBeenCalledWith({ type: "active" });
  });

  it("does nothing when token stays the same", () => {
    mockSubscribe.mockImplementation((callback: any) => {
      // No change scenario
      callback({ token: "same-token" }, { token: "same-token" });
      return jest.fn();
    });

    const qc = createQueryClient();
    const clearSpy = jest.spyOn(qc, "clear");
    const invalidateSpy = jest.spyOn(qc, "invalidateQueries");

    renderHook(() => useAuthCacheSync(), { wrapper: createWrapper(qc) });

    expect(clearSpy).not.toHaveBeenCalled();
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it("unsubscribes on unmount", () => {
    const unsubscribe = jest.fn();
    mockSubscribe.mockReturnValue(unsubscribe);

    const qc = createQueryClient();
    const { unmount } = renderHook(() => useAuthCacheSync(), {
      wrapper: createWrapper(qc),
    });

    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
