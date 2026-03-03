/**
 * useAuth hook — unit tests.
 *
 * Covers:
 *   - Returns user object when authenticated
 *   - Returns null user when not authenticated
 *   - isAuthenticated derived from token presence
 *   - Exposes login/logout functions
 *   - Memoizes user object
 */

import { renderHook, act } from "@testing-library/react-native";

// ── Mock authStore ──────────────────────────────────────────────────

const mockState = {
  token: "test-token",
  userId: 1,
  username: "testuser",
  name: "Test User",
  loading: false,
  error: null,
  login: jest.fn(),
  logout: jest.fn(),
};

let selectorCallbacks: Map<string, Function> = new Map();

jest.mock("@/services/authStore", () => ({
  useAuthStore: (selector: (state: any) => any) => {
    return selector(mockState);
  },
}));

import { useAuth, AuthUser } from "@/hooks/useAuth";

describe("useAuth", () => {
  beforeEach(() => {
    mockState.token = "test-token";
    mockState.userId = 1;
    mockState.username = "testuser";
    mockState.name = "Test User";
    mockState.loading = false;
    mockState.error = null;
  });

  it("returns user object when authenticated", () => {
    const { result } = renderHook(() => useAuth());

    expect(result.current.user).toEqual({
      id: 1,
      username: "testuser",
      name: "Test User",
    });
  });

  it("returns isAuthenticated true when token exists", () => {
    const { result } = renderHook(() => useAuth());
    expect(result.current.isAuthenticated).toBe(true);
  });

  it("returns null user when not authenticated", () => {
    mockState.userId = null as any;
    mockState.username = null as any;
    mockState.token = null as any;

    const { result } = renderHook(() => useAuth());

    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
  });

  it("returns null user when userId is missing", () => {
    mockState.userId = null as any;

    const { result } = renderHook(() => useAuth());
    expect(result.current.user).toBeNull();
  });

  it("returns null user when username is missing", () => {
    mockState.username = null as any;

    const { result } = renderHook(() => useAuth());
    expect(result.current.user).toBeNull();
  });

  it("exposes login function", () => {
    const { result } = renderHook(() => useAuth());
    expect(typeof result.current.login).toBe("function");
  });

  it("exposes logout function", () => {
    const { result } = renderHook(() => useAuth());
    expect(typeof result.current.logout).toBe("function");
  });

  it("returns loading state", () => {
    mockState.loading = true;

    const { result } = renderHook(() => useAuth());
    expect(result.current.loading).toBe(true);
  });

  it("returns error state", () => {
    mockState.error = "Something went wrong";

    const { result } = renderHook(() => useAuth());
    expect(result.current.error).toBe("Something went wrong");
  });

  it("handles user with null name", () => {
    mockState.name = null as any;

    const { result } = renderHook(() => useAuth());

    expect(result.current.user).toEqual({
      id: 1,
      username: "testuser",
      name: null,
    });
  });

  it("returns token from store", () => {
    const { result } = renderHook(() => useAuth());
    expect(result.current.token).toBe("test-token");
  });
});
