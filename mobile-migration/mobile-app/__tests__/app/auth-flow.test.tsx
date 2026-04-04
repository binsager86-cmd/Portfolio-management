/**
 * Authentication flow — integration tests.
 *
 * Covers:
 *   - Redirects to login when not authenticated
 *   - Redirects to dashboard when authenticated
 *   - Handles token expiration gracefully
 *   - Handles auth hydration loading state
 *   - Login/logout cycle
 */

import { render } from "@testing-library/react-native";
import React from "react";

// ── Mock authStore with controllable state ─────────────────────────

let mockAuthState: Record<string, any> = {};

jest.mock("@/services/authStore", () => ({
  useAuthStore: (selector: (state: any) => any) => selector(mockAuthState),
}));

// ── Mock expo-router ────────────────────────────────────────────────

const mockReplace = jest.fn();
const mockRedirect = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: mockReplace,
    back: jest.fn(),
  }),
  useLocalSearchParams: jest.fn(() => ({})),
  useSegments: jest.fn(() => []),
  Redirect: ({ href }: { href: string }) => {
    mockRedirect(href);
    return null;
  },
  Link: "Link",
  Tabs: { Screen: "TabsScreen" },
}));

// ── Import component under test after mocks ────────────────────────

import Index from "@/app/index";

describe("Authentication Flow — Root Index", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthState = {
      token: null,
      userId: null,
      username: null,
      name: null,
      isLoading: false,
      error: null,
      login: jest.fn(),
      logout: jest.fn(),
      hydrate: jest.fn(),
      clearError: jest.fn(),
    };
  });

  it("redirects to login when not authenticated", () => {
    mockAuthState.token = null;
    mockAuthState.isLoading = false;

    render(<Index />);

    expect(mockRedirect).toHaveBeenCalledWith("/(auth)/login");
  });

  it("redirects to dashboard when authenticated", () => {
    mockAuthState.token = "valid-jwt-token";
    mockAuthState.isLoading = false;

    render(<Index />);

    expect(mockRedirect).toHaveBeenCalledWith("/(tabs)");
  });

  it("renders nothing while auth is hydrating (loading)", () => {
    mockAuthState.isLoading = true;
    mockAuthState.token = null;

    const { toJSON } = render(<Index />);

    // Should render null — no redirect while loading
    expect(toJSON()).toBeNull();
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("redirects to login after token is cleared (logout)", () => {
    // Start authenticated
    mockAuthState.token = "valid-jwt-token";
    mockAuthState.isLoading = false;

    const { rerender } = render(<Index />);
    expect(mockRedirect).toHaveBeenCalledWith("/(tabs)");

    jest.clearAllMocks();

    // Simulate logout — token removed
    mockAuthState.token = null;
    rerender(<Index />);

    expect(mockRedirect).toHaveBeenCalledWith("/(auth)/login");
  });

  it("does not redirect while hydration is in progress even with stale token", () => {
    mockAuthState.token = "stale-token";
    mockAuthState.isLoading = true;

    const { toJSON } = render(<Index />);

    expect(toJSON()).toBeNull();
    expect(mockRedirect).not.toHaveBeenCalled();
  });
});
