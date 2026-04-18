/**
 * Holdings Screen tests — hook-level mocking.
 *
 * Covers:
 *   - Loading state (skeleton)
 *   - Data display (holding count, symbols)
 *   - Error state
 *   - Filter buttons (All, KFH, BBYN, USA)
 *   - Empty state
 */

import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MOCK_HOLDINGS, createTestQueryClient } from "../helpers";

// ── Mock state ──────────────────────────────────────────────────────

const mockRefetch = jest.fn().mockResolvedValue({});
const mockSetFilter = jest.fn();

const mockViewState = {
  filter: undefined as string | undefined,
  setFilter: mockSetFilter,
  sortCol: "symbol" as string,
  sortDir: "asc" as "asc" | "desc",
  onSort: jest.fn(),
  resp: null as any,
  isLoading: false,
  isError: false,
  error: null as any,
  refetch: mockRefetch,
  isRefetching: false,
  sortedHoldings: [] as any[],
  totals: {
    total_market_value_kwd: 0,
    total_cost_kwd: 0,
    total_unrealized_pnl_kwd: 0,
    total_market_value_usd: 0,
    total_cost_usd: 0,
    total_unrealized_pnl_usd: 0,
  },
  allocationData: [] as any[],
  depositTotals: {} as any,
};

// ── Mocks ───────────────────────────────────────────────────────────

jest.mock("@/src/features/holdings/hooks/useHoldingsView", () => ({
  useHoldingsView: () => mockViewState,
  TABLE_COLUMNS: [],
  SUMMARY_COLUMNS: [],
  TOTAL_TABLE_WIDTH: 800,
  SUMMARY_TABLE_WIDTH: 600,
}));

jest.mock("@/hooks/queries", () => ({
  useCashBalances: () => ({ data: null, refetch: jest.fn() }),
  useHoldings: () => ({ data: null }),
  portfolioKeys: { all: ["portfolio"] },
}));

jest.mock("@/services/api", () => ({
  getHoldings: jest.fn(),
  exportHoldingsExcel: jest.fn(),
}));

jest.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: 1 }, token: "test-token", isAuthenticated: true }),
}));

jest.mock("@/services/authStore", () => ({
  useAuthStore: Object.assign(
    () => ({ token: "test-token", user: { id: 1 } }),
    { getState: () => ({ token: "test-token", user: { id: 1 } }) }
  ),
}));

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

jest.mock("@/hooks/useResponsive", () => ({
  useResponsive: () => ({
    width: 375,
    height: 812,
    bp: "phone",
    isPhone: true,
    isTablet: false,
    isDesktop: false,
    metricCols: 2,
    spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, pagePx: 16 },
    fonts: { xs: 10, sm: 12, md: 14, lg: 18, xl: 24, xxl: 32 },
    maxContentWidth: 375,
  }),
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaProvider: ({ children }: any) => children,
}));

// Mock DataScreen to faithfully reproduce its loading/error/data branching
jest.mock("@/components/screens", () => ({
  DataScreen: ({ loading, error, onRetry, loadingSkeleton, children }: any) => {
    const { View, Text, Pressable } = require("react-native");
    if (loading) return loadingSkeleton ?? <Text testID="loading">Loading…</Text>;
    if (error) return (
      <View>
        <Text testID="error-message">{error}</Text>
        {onRetry && <Pressable testID="retry-button" onPress={onRetry}><Text>Retry</Text></Pressable>}
      </View>
    );
    return <View>{children}</View>;
  },
}));

jest.mock("@/components/ui/PageSkeletons", () => ({
  HoldingsTableSkeleton: () => {
    const { Text } = require("react-native");
    return <Text testID="loading-skeleton">Loading…</Text>;
  },
}));

jest.mock("@/components/ui/FilterChip", () => ({
  FilterChip: ({ label, active, onPress }: any) => {
    const { Pressable, Text } = require("react-native");
    return (
      <Pressable testID={`filter-${label}`} onPress={onPress}>
        <Text>{label}</Text>
      </Pressable>
    );
  },
}));

jest.mock("@/components/portfolio/KpiWidgets", () => ({
  KpiCard: ({ label, value }: any) => {
    const { Text, View } = require("react-native");
    return (
      <View testID={`kpi-${label}`}>
        <Text>{value}</Text>
      </View>
    );
  },
}));

jest.mock("@/components/portfolio/CashBalancesSection", () => ({
  CashBalancesSection: () => null,
}));

jest.mock("@/components/charts/AllocationDonut", () => ({
  AllocationDonut: () => null,
}));

jest.mock("@/components/ui/ResponsiveDataTable", () => ({
  ResponsiveDataTable: ({ data, columns, keyExtractor }: any) => {
    const { View, Text } = require("react-native");
    return (
      <View testID="data-table">
        {(data ?? []).map((item: any) => (
          <View key={keyExtractor(item)} testID={`row-${item.symbol}`}>
            {columns.map((col: any) => (
              <Text key={col.key}>{typeof col.render === "function" ? col.render(item) : String(item[col.key])}</Text>
            ))}
          </View>
        ))}
        {(!data || data.length === 0) && <Text testID="empty-table">No active holdings found</Text>}
      </View>
    );
  },
}));

jest.mock("@/src/features/holdings/components/HoldingsDataGrid", () => ({
  HeaderCell: () => null,
  HoldingRow: () => null,
  TotalCell: () => null,
  ts: {},
}));

jest.mock("@/src/features/holdings/components/StockMergeModal", () => ({
  StockMergeModal: () => null,
}));

jest.mock("@/src/features/fundamental-analysis/types", () => ({
  getApiErrorMessage: (err: any, fallback: string) => {
    if (err && typeof err === "object" && err.message) return err.message;
    return fallback;
  },
}));

// ── Import after mocks ──────────────────────────────────────────────

import HoldingsScreen from "@/app/(tabs)/holdings";

// ── Helpers ─────────────────────────────────────────────────────────

function renderScreen(qc?: QueryClient) {
  const queryClient = qc ?? createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <HoldingsScreen />
    </QueryClientProvider>
  );
}

// ── Tests ───────────────────────────────────────────────────────────

describe("HoldingsScreen", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = createTestQueryClient();
    mockRefetch.mockClear();
    mockSetFilter.mockClear();
    // Reset state
    mockViewState.resp = null;
    mockViewState.isLoading = false;
    mockViewState.isError = false;
    mockViewState.error = null;
    mockViewState.sortedHoldings = [];
    mockViewState.filter = undefined;
  });

  afterEach(() => {
    queryClient.clear();
  });

  // ── Loading state ──

  it("shows loading indicator while fetching", () => {
    mockViewState.isLoading = true;
    renderScreen(queryClient);

    expect(screen.getByTestId("loading-skeleton")).toBeTruthy();
    expect(screen.queryByTestId("error-message")).toBeNull();
  });

  // ── Success state ──

  it("renders holding symbols", () => {
    mockViewState.resp = MOCK_HOLDINGS;
    mockViewState.sortedHoldings = MOCK_HOLDINGS.holdings;

    renderScreen(queryClient);

    expect(screen.getByText(/HUMANSOFT/)).toBeTruthy();
    expect(screen.getByText(/NBK/)).toBeTruthy();
  });

  it("renders company names in data table", () => {
    mockViewState.resp = MOCK_HOLDINGS;
    mockViewState.sortedHoldings = MOCK_HOLDINGS.holdings;

    renderScreen(queryClient);

    expect(screen.getByText(/Humansoft Holding/)).toBeTruthy();
    expect(screen.getByText(/National Bank of Kuwait/)).toBeTruthy();
  });

  it("renders totals banner with holding count", () => {
    mockViewState.resp = { ...MOCK_HOLDINGS, count: 2 };
    mockViewState.sortedHoldings = MOCK_HOLDINGS.holdings;

    renderScreen(queryClient);

    expect(screen.getByText("2")).toBeTruthy();
  });

  it("shows singular count for 1 holding", () => {
    mockViewState.resp = {
      ...MOCK_HOLDINGS,
      holdings: [MOCK_HOLDINGS.holdings[0]],
      count: 1,
    };
    mockViewState.sortedHoldings = [MOCK_HOLDINGS.holdings[0]];

    renderScreen(queryClient);

    expect(screen.getByText("1")).toBeTruthy();
  });

  // ── Filter buttons ──

  it("renders filter buttons: All, KFH, BBYN, USA", () => {
    mockViewState.resp = MOCK_HOLDINGS;
    mockViewState.sortedHoldings = MOCK_HOLDINGS.holdings;

    renderScreen(queryClient);

    expect(screen.getByText("All")).toBeTruthy();
    expect(screen.getByText("KFH")).toBeTruthy();
    expect(screen.getByText("BBYN")).toBeTruthy();
    expect(screen.getByText("USA")).toBeTruthy();
  });

  it("calls setFilter when portfolio tab pressed", () => {
    mockViewState.resp = MOCK_HOLDINGS;
    mockViewState.sortedHoldings = MOCK_HOLDINGS.holdings;

    renderScreen(queryClient);

    fireEvent.press(screen.getByTestId("filter-KFH"));
    expect(mockSetFilter).toHaveBeenCalledWith("KFH");
  });

  // ── Error state ──

  it("shows error message on API failure", () => {
    mockViewState.isError = true;
    mockViewState.error = new Error("Network timeout");

    renderScreen(queryClient);

    expect(screen.getByTestId("error-message")).toBeTruthy();
    expect(screen.getByText("Network timeout")).toBeTruthy();
  });

  // ── Empty state ──

  it("shows empty message when no holdings", () => {
    mockViewState.resp = { ...MOCK_HOLDINGS, holdings: [], count: 0 };
    mockViewState.sortedHoldings = [];

    renderScreen(queryClient);

    expect(screen.getByText(/No active holdings found/)).toBeTruthy();
  });
});
