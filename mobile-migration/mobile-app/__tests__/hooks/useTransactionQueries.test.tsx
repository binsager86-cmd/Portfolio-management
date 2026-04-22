/**
 * useTransactionQueries — unit tests for the four query hooks:
 *   - useTransactions (paginated list with filters)
 *   - useAllTransactions (unpaginated)
 *   - useTransactionCount (lightweight count)
 *   - useTransaction (single by id, gated by `editId`)
 *
 * Goal: lock the public contract (key shape, params forwarded, enable/disable
 * semantics) so refactors of staleTime / placeholderData don't silently
 * break call sites.
 */

import React from "react";
import { renderHook, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import {
  useTransactions,
  useAllTransactions,
  useTransactionCount,
  useTransaction,
  transactionKeys,
} from "@/hooks/queries/useTransactionQueries";

const mockGetTransactions = jest.fn();
const mockGetTransaction = jest.fn();

jest.mock("@/services/api", () => ({
  getTransactions: (...args: unknown[]) =>
    (mockGetTransactions as (...a: unknown[]) => unknown)(...args),
  getTransaction: (...args: unknown[]) =>
    (mockGetTransaction as (...a: unknown[]) => unknown)(...args),
}));

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
}

function makeWrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe("transactionKeys", () => {
  it("produces stable list keys for identical params", () => {
    const a = transactionKeys.list(1, 50, "KFH", "BBYN", "buy");
    const b = transactionKeys.list(1, 50, "KFH", "BBYN", "buy");
    expect(a).toEqual(b);
  });

  it("produces different list keys when any param changes", () => {
    const base = transactionKeys.list(1, 50, undefined, undefined, undefined);
    expect(transactionKeys.list(2, 50)).not.toEqual(base);
    expect(transactionKeys.list(1, 100)).not.toEqual(base);
    expect(transactionKeys.list(1, 50, "KFH")).not.toEqual(base);
  });

  it("namespaces detail keys under 'transaction'", () => {
    expect(transactionKeys.detail("42")).toEqual(["transaction", "42"]);
  });
});

describe("useTransactions", () => {
  beforeEach(() => {
    mockGetTransactions.mockReset();
  });

  it("forwards params and defaults perPage to 50", async () => {
    mockGetTransactions.mockResolvedValue({ count: 0, results: [] });
    const client = makeClient();

    const { result } = renderHook(
      () => useTransactions({ page: 1, portfolio: "KFH", symbol: "BBYN" }),
      { wrapper: makeWrapper(client) },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockGetTransactions).toHaveBeenCalledWith({
      page: 1,
      per_page: 50,
      portfolio: "KFH",
      symbol: "BBYN",
    });
  });

  it("honours an explicit perPage", async () => {
    mockGetTransactions.mockResolvedValue({ count: 0, results: [] });
    const client = makeClient();

    const { result } = renderHook(
      () => useTransactions({ page: 2, perPage: 100 }),
      { wrapper: makeWrapper(client) },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockGetTransactions).toHaveBeenCalledWith({
      page: 2,
      per_page: 100,
      portfolio: undefined,
      symbol: undefined,
    });
  });
});

describe("useAllTransactions", () => {
  beforeEach(() => {
    mockGetTransactions.mockReset();
  });

  it("requests a single large page", async () => {
    mockGetTransactions.mockResolvedValue({ count: 0, results: [] });
    const client = makeClient();

    const { result } = renderHook(() => useAllTransactions(), {
      wrapper: makeWrapper(client),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockGetTransactions).toHaveBeenCalledWith({
      page: 1,
      per_page: 10000,
    });
  });
});

describe("useTransactionCount", () => {
  beforeEach(() => {
    mockGetTransactions.mockReset();
  });

  it("returns just the count value, not the full list", async () => {
    mockGetTransactions.mockResolvedValue({ count: 137, results: [] });
    const client = makeClient();

    const { result } = renderHook(() => useTransactionCount(), {
      wrapper: makeWrapper(client),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockGetTransactions).toHaveBeenCalledWith({ page: 1, per_page: 1 });
    expect(result.current.data).toBe(137);
  });
});

describe("useTransaction", () => {
  beforeEach(() => {
    mockGetTransaction.mockReset();
  });

  it("does not fire when editId is undefined", () => {
    const client = makeClient();
    renderHook(() => useTransaction(undefined), {
      wrapper: makeWrapper(client),
    });

    // enabled: !!editId → no fetch
    expect(mockGetTransaction).not.toHaveBeenCalled();
  });

  it("fetches the right id and coerces the string to a number", async () => {
    mockGetTransaction.mockResolvedValue({ id: 42, symbol: "BBYN" });
    const client = makeClient();

    const { result } = renderHook(() => useTransaction("42"), {
      wrapper: makeWrapper(client),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockGetTransaction).toHaveBeenCalledWith(42);
    expect(result.current.data).toEqual({ id: 42, symbol: "BBYN" });
  });
});
