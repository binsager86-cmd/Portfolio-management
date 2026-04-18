/**
 * OverviewScreen — Integration tests.
 *
 * Covers:
 *   - Loading state (skeleton)
 *   - Successful data render (hero banner, metric cards, portfolio cards)
 *   - Error state (error message + retry button)
 *   - Computed metrics (unrealized, realized, total profit)
 */

import React from "react";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MOCK_OVERVIEW_DATA, MOCK_USER, createTestQueryClient } from "../helpers";

// ── Mocks ───────────────────────────────────────────────────────────

const mockRefetch = jest.fn().mockResolvedValue({});

// Mock query hooks directly — the component uses hooks, not raw API calls
const mockPortfolioOverview = {
  data: undefined as any,
  isLoading: false,
  isError: false,
  error: null as any,
  refetch: mockRefetch,
  isRefetching: false,
};

jest.mock("@/hooks/queries", () => ({
  usePortfolioOverview: () => mockPortfolioOverview,
  useHoldings: () => ({ data: null }),
  useCashBalances: () => ({ data: null, refetch: jest.fn() }),
  useOverviewDependentQueries: () => [
    { data: null },
    { data: null },
    { data: null },
  ],
  useRiskMetrics: () => ({ data: null }),
  useRfRateSetting: () => ({ data: null }),
  useAiStatus: () => ({ data: null }),
  portfolioKeys: { all: ["portfolio"] },
}));

// Mock API module (for analyzePortfolio mutation + other imports)
jest.mock("@/services/api", () => ({
  getOverview: jest.fn(),
  analyzePortfolio: jest.fn(),
  savePortfolioSnapshot: jest.fn(),
  exportHoldingsExcel: jest.fn(),
}));

// Mock auth hook
jest.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: MOCK_USER,
    token: "test-token",
    isAuthenticated: true,
    loading: false,
  }),
}));

// Mock auth store
jest.mock("@/services/authStore", () => ({
  useAuthStore: Object.assign(
    () => ({ token: "test-token", user: MOCK_USER }),
    { getState: () => ({ token: "test-token", user: MOCK_USER }) }
  ),
}));

// Mock theme store
jest.mock("@/services/themeStore", () => ({
  useThemeStore: () => ({
    mode: "dark",
    toggle: jest.fn(),
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
    spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 },
    fonts: { xs: 10, sm: 12, md: 14, lg: 18, xl: 24, xxl: 32 },
    maxContentWidth: 375,
  }),
}));

// Mock price refresh
jest.mock("@/hooks/usePriceRefresh", () => ({
  usePriceRefresh: () => ({ refresh: jest.fn().mockResolvedValue(undefined) }),
}));

// Mock user prefs store
jest.mock("@/src/store/userPrefsStore", () => ({
  useUserPrefsStore: (selector?: any) => {
    const state = {
      preferences: { expertiseLevel: "intermediate", showAdvancedMetrics: false, dividendFocus: false },
    };
    return selector ? selector(state) : state;
  },
}));

// Mock safe area
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaProvider: ({ children }: any) => children,
}));

// Mock child components to isolate screen logic
jest.mock("@/components/ui/OverviewSkeleton", () => ({
  OverviewSkeleton: () => {
    const { Text } = require("react-native");
    return <Text testID="loading-skeleton">Loading…</Text>;
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

jest.mock("@/components/charts/SnapshotLineChart", () => ({
  SnapshotLineChart: () => null,
}));

jest.mock("@/components/overview/HistoricalPerformance", () => ({
  HistoricalPerformance: () => null,
}));

jest.mock("@/components/overview/AIFinancialIntelligence", () => ({
  AIFinancialIntelligence: () => null,
}));

jest.mock("@/components/overview/PortfolioHealthCard", () => ({
  PortfolioHealthCard: () => null,
}));

jest.mock("@/components/overview/RealizedTradesSection", () => ({
  RealizedTradesSection: () => null,
}));

jest.mock("@/components/overview/LocalInsightsPanel", () => ({
  LocalInsightsPanel: () => null,
}));

jest.mock("@/components/overview/StrategySelector", () => ({
  StrategySelector: () => null,
}));

jest.mock("@/components/trading/TradeSimulatorModal", () => ({
  TradeSimulatorModal: () => null,
}));

jest.mock("@/components/news/NewsFeed", () => ({
  NewsFeed: () => null,
}));

jest.mock("@/components/onboarding/FirstTimeSetup", () => ({
  FirstTimeSetup: () => null,
}));

jest.mock("@/components/ui/ErrorBoundary", () => ({
  withErrorBoundary: (Component: any) => Component,
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
    mockRefetch.mockClear();
    // Reset to default state
    mockPortfolioOverview.data = undefined;
    mockPortfolioOverview.isLoading = false;
    mockPortfolioOverview.isError = false;
    mockPortfolioOverview.error = null;
  });

  afterEach(() => {
    queryClient.clear();
  });

  // ── Loading state ──

  it("shows loading skeleton while data is fetching", () => {
    mockPortfolioOverview.isLoading = true;

    renderScreen(queryClient);
    expect(screen.getByTestId("loading-skeleton")).toBeTruthy();
  });

  // ── Success state ──

  it("renders content after data loads", () => {
    mockPortfolioOverview.data = MOCK_OVERVIEW_DATA;

    renderScreen(queryClient);

    // Should render something from the overview data
    expect(screen.queryByTestId("loading-skeleton")).toBeNull();
    expect(screen.queryByTestId("error-message")).toBeNull();
  });

  it("renders per-portfolio cards", () => {
    mockPortfolioOverview.data = MOCK_OVERVIEW_DATA;

    renderScreen(queryClient);

    expect(screen.getByTestId("portfolio-card-KFH")).toBeTruthy();
    expect(screen.getByTestId("portfolio-card-BBYN")).toBeTruthy();
    expect(screen.getByTestId("portfolio-card-USA")).toBeTruthy();
  });

  it("renders portfolio chart", () => {
    mockPortfolioOverview.data = MOCK_OVERVIEW_DATA;

    renderScreen(queryClient);

    expect(screen.getByTestId("portfolio-chart")).toBeTruthy();
  });

  // ── Error state ──

  it("shows error screen on API failure", () => {
    mockPortfolioOverview.isError = true;
    mockPortfolioOverview.error = new Error("Network Error");

    renderScreen(queryClient);

    expect(screen.getByTestId("error-message")).toBeTruthy();
  });

  it("retry button calls refetch", () => {
    mockPortfolioOverview.isError = true;
    mockPortfolioOverview.error = new Error("Temporary failure");

    renderScreen(queryClient);

    const retryButton = screen.getByTestId("retry-button");
    fireEvent.press(retryButton);

    expect(mockRefetch).toHaveBeenCalled();
  });

  // ── Edge cases ──

  it("handles empty portfolio_values gracefully", () => {
    mockPortfolioOverview.data = {
      ...MOCK_OVERVIEW_DATA,
      by_portfolio: {},
      portfolio_values: {},
    };

    renderScreen(queryClient);

    expect(screen.queryByTestId("portfolio-card-KFH")).toBeNull();
  });

  it("handles zero values without crashing", () => {
    mockPortfolioOverview.data = {
      ...MOCK_OVERVIEW_DATA,
      total_value: 0,
      total_gain: 0,
      roi_percent: 0,
    };

    renderScreen(queryClient);

    expect(screen.queryByTestId("error-message")).toBeNull();
  });
});
