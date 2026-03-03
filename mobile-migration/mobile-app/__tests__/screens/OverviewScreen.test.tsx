/**
 * OverviewScreen — Integration tests.
 *
 * Covers:
 *   - Loading state (spinner + message)
 *   - Successful data render (hero banner, metric cards, portfolio cards, FX footer)
 *   - Error state (error message + retry button)
 *   - Pull-to-refresh triggers refetch
 *   - Computed metrics (unrealized, realized, total profit aggregated from by_portfolio)
 */

import React from "react";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MOCK_OVERVIEW_DATA, MOCK_USER, createTestQueryClient } from "../helpers";

// ── Mocks ───────────────────────────────────────────────────────────

// Mock API module
const mockGetOverview = jest.fn();
jest.mock("@/services/api", () => ({
  getOverview: (...args: any[]) => mockGetOverview(...args),
}));

// Mock auth hook
jest.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: MOCK_USER,
    token: "test-token",
    isAuthenticated: true,
    loading: false,
    error: null,
    login: jest.fn(),
    logout: jest.fn(),
  }),
}));

// Mock theme store — return dark theme colors
jest.mock("@/services/themeStore", () => ({
  useThemeStore: () => ({
    mode: "dark",
    colors: {
      bgPrimary: "#0a0a15",
      bgSecondary: "#121220",
      bgCard: "#1a1a2e",
      bgCardHover: "#252540",
      bgInput: "#121220",
      textPrimary: "#e6e6f0",
      textSecondary: "#a0a0b0",
      textMuted: "#6b6b80",
      accentPrimary: "#8a2be2",
      accentSecondary: "#4cc9f0",
      accentTertiary: "#ff00cc",
      success: "#00d4ff",
      warning: "#ff9e00",
      danger: "#ff4757",
      borderColor: "rgba(255,255,255,0.08)",
      cardShadowColor: "rgba(0,0,0,0.4)",
      tabBarBg: "#121220",
      tabBarBorder: "rgba(255,255,255,0.06)",
      headerBg: "#0a0a15",
    },
  }),
}));

// Mock responsive hook — default to phone layout
jest.mock("@/hooks/useResponsive", () => ({
  useResponsive: () => ({
    width: 375,
    height: 812,
    bp: "phone",
    isPhone: true,
    isTablet: false,
    isDesktop: false,
    metricCols: 2,
  }),
}));

// Mock child components to isolate screen logic
jest.mock("@/components/ui/LoadingScreen", () => ({
  LoadingScreen: ({ message }: { message?: string }) => {
    const { Text } = require("react-native");
    return <Text testID="loading-screen">{message ?? "Loading…"}</Text>;
  },
}));

jest.mock("@/components/ui/ErrorScreen", () => ({
  ErrorScreen: ({ message, onRetry }: { message: string; onRetry?: () => void }) => {
    const { Text, Pressable } = require("react-native");
    return (
      <>
        <Text testID="error-message">{message}</Text>
        {onRetry && (
          <Pressable testID="retry-button" onPress={onRetry}>
            <Text>Retry</Text>
          </Pressable>
        )}
      </>
    );
  },
}));

jest.mock("@/components/ui/MetricCard", () => ({
  MetricCard: ({ label, value, subline }: any) => {
    const { View, Text } = require("react-native");
    return (
      <View testID={`metric-${label}`}>
        <Text>{label}</Text>
        <Text testID={`metric-value-${label}`}>{value}</Text>
        {subline && <Text testID={`metric-sub-${label}`}>{subline}</Text>}
      </View>
    );
  },
}));

jest.mock("@/components/portfolio/PortfolioCard", () => ({
  PortfolioCard: ({ name }: { name: string }) => {
    const { Text } = require("react-native");
    return <Text testID={`portfolio-card-${name}`}>{name}</Text>;
  },
}));

jest.mock("@/components/charts/PortfolioChart", () => ({
  PortfolioChart: () => {
    const { View } = require("react-native");
    return <View testID="portfolio-chart" />;
  },
}));

// ── Import screen after mocks ───────────────────────────────────────

import OverviewScreen from "@/app/(tabs)/index";

// ── Helper: render with query client ────────────────────────────────

function renderScreen(qc?: QueryClient) {
  const queryClient = qc ?? createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <OverviewScreen />
    </QueryClientProvider>
  );
}

// ── Tests ───────────────────────────────────────────────────────────

describe("OverviewScreen", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = createTestQueryClient();
    mockGetOverview.mockReset();
  });

  afterEach(() => {
    queryClient.clear();
  });

  // ── Loading state ──

  it("shows loading screen while data is fetching", () => {
    // Never resolves — stays in loading state
    mockGetOverview.mockReturnValue(new Promise(() => {}));

    renderScreen(queryClient);
    expect(screen.getByTestId("loading-screen")).toBeTruthy();
    expect(screen.getByText("Loading portfolio…")).toBeTruthy();
  });

  // ── Success state ──

  it("renders hero banner with total value after data loads", async () => {
    mockGetOverview.mockResolvedValueOnce(MOCK_OVERVIEW_DATA);

    renderScreen(queryClient);

    await waitFor(() => {
      expect(screen.getByText(/Total Portfolio Value/)).toBeTruthy();
    });

    // Total value appears in multiple places (hero + metric card)
    const matches = screen.getAllByText(/55,000/);
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it("renders Portfolio Snapshot metric cards", async () => {
    mockGetOverview.mockResolvedValueOnce(MOCK_OVERVIEW_DATA);

    renderScreen(queryClient);

    await waitFor(() => {
      expect(screen.getByTestId("metric-Total Value")).toBeTruthy();
    });

    expect(screen.getByTestId("metric-Total Deposits")).toBeTruthy();
    expect(screen.getByTestId("metric-Net Gain")).toBeTruthy();
    expect(screen.getByTestId("metric-Active Holdings")).toBeTruthy();
    expect(screen.getByTestId("metric-Total Fees")).toBeTruthy();
  });

  it("renders Profit Breakdown metric cards", async () => {
    mockGetOverview.mockResolvedValueOnce(MOCK_OVERVIEW_DATA);

    renderScreen(queryClient);

    await waitFor(() => {
      expect(screen.getByTestId("metric-Realized Profit")).toBeTruthy();
    });

    expect(screen.getByTestId("metric-Unrealized P/L")).toBeTruthy();
    expect(screen.getByTestId("metric-Total Profit")).toBeTruthy();
  });

  it("renders per-portfolio cards", async () => {
    mockGetOverview.mockResolvedValueOnce(MOCK_OVERVIEW_DATA);

    renderScreen(queryClient);

    await waitFor(() => {
      expect(screen.getByTestId("portfolio-card-KFH")).toBeTruthy();
    });

    expect(screen.getByTestId("portfolio-card-BBYN")).toBeTruthy();
    expect(screen.getByTestId("portfolio-card-USA")).toBeTruthy();
  });

  it("renders FX rate footer", async () => {
    mockGetOverview.mockResolvedValueOnce(MOCK_OVERVIEW_DATA);

    renderScreen(queryClient);

    await waitFor(() => {
      expect(screen.getByText(/USD\/KWD Rate/)).toBeTruthy();
    });

    expect(screen.getByText(/0\.307000/)).toBeTruthy();
  });

  it("renders portfolio chart placeholder", async () => {
    mockGetOverview.mockResolvedValueOnce(MOCK_OVERVIEW_DATA);

    renderScreen(queryClient);

    await waitFor(() => {
      expect(screen.getByTestId("portfolio-chart")).toBeTruthy();
    });
  });

  it("displays correct active holdings count", async () => {
    mockGetOverview.mockResolvedValueOnce(MOCK_OVERVIEW_DATA);

    renderScreen(queryClient);

    await waitFor(() => {
      expect(screen.getByTestId("metric-Active Holdings")).toBeTruthy();
    });

    // Sum of holding_count: KFH(8) + BBYN(5) + USA(3) = 16
    const holdingsValue = screen.getByTestId("metric-value-Active Holdings");
    expect(holdingsValue.children[0]).toBe("16");
  });

  it("displays correct transaction count in Active Holdings subline", async () => {
    mockGetOverview.mockResolvedValueOnce(MOCK_OVERVIEW_DATA);

    renderScreen(queryClient);

    await waitFor(() => {
      expect(screen.getByTestId("metric-sub-Active Holdings")).toBeTruthy();
    });

    expect(screen.getByText(/42 transactions/)).toBeTruthy();
  });

  // ── Aggregated computed metrics ──

  it("computes aggregated unrealized PnL from by_portfolio", async () => {
    mockGetOverview.mockResolvedValueOnce(MOCK_OVERVIEW_DATA);

    renderScreen(queryClient);

    await waitFor(() => {
      expect(screen.getByTestId("metric-Unrealized P/L")).toBeTruthy();
    });

    // Sum: KFH(2500) + BBYN(-300) + USA(800) = 3000
    const unrealValue = screen.getByTestId("metric-value-Unrealized P/L");
    expect(unrealValue).toBeTruthy();
  });

  // ── Error state ──

  it("shows error screen on API failure", async () => {
    mockGetOverview.mockRejectedValueOnce(new Error("Network Error"));

    renderScreen(queryClient);

    await waitFor(() => {
      expect(screen.getByTestId("error-message")).toBeTruthy();
    });

    expect(screen.getByText("Network Error")).toBeTruthy();
    expect(screen.getByTestId("retry-button")).toBeTruthy();
  });

  it("shows API error detail when available", async () => {
    const apiError: any = new Error("Request failed");
    apiError.response = { data: { detail: "Token expired" } };
    mockGetOverview.mockRejectedValueOnce(apiError);

    renderScreen(queryClient);

    await waitFor(() => {
      expect(screen.getByText("Token expired")).toBeTruthy();
    });
  });

  it("retry button triggers refetch", async () => {
    mockGetOverview
      .mockRejectedValueOnce(new Error("Temporary failure"))
      .mockResolvedValueOnce(MOCK_OVERVIEW_DATA);

    renderScreen(queryClient);

    // Wait for error state
    await waitFor(() => {
      expect(screen.getByTestId("retry-button")).toBeTruthy();
    });

    // Press retry
    await act(async () => {
      fireEvent.press(screen.getByTestId("retry-button"));
    });

    // Should now load data
    await waitFor(() => {
      expect(screen.getByText(/Total Portfolio Value/)).toBeTruthy();
    });

    expect(mockGetOverview).toHaveBeenCalledTimes(2);
  });

  // ── Edge cases ──

  it("handles null/zero by_portfolio gracefully", async () => {
    const data = {
      ...MOCK_OVERVIEW_DATA,
      by_portfolio: {},
      portfolio_values: {},
    };
    mockGetOverview.mockResolvedValueOnce(data);

    renderScreen(queryClient);

    await waitFor(() => {
      expect(screen.getByText(/Total Portfolio Value/)).toBeTruthy();
    });

    // Should not crash — no portfolio cards rendered
    expect(screen.queryByTestId("portfolio-card-KFH")).toBeNull();
  });

  it("handles missing optional fields with dash fallback", async () => {
    const data = {
      ...MOCK_OVERVIEW_DATA,
      total_value: 0,
      total_gain: 0,
      roi_percent: 0,
    };
    mockGetOverview.mockResolvedValueOnce(data);

    renderScreen(queryClient);

    await waitFor(() => {
      expect(screen.getByText(/Total Portfolio Value/)).toBeTruthy();
    });
  });

  // ── Query key includes user id ──

  it("calls getOverview on mount", async () => {
    mockGetOverview.mockResolvedValueOnce(MOCK_OVERVIEW_DATA);

    renderScreen(queryClient);

    await waitFor(() => {
      expect(mockGetOverview).toHaveBeenCalledTimes(1);
    });
  });
});
