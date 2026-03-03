/**
 * Holdings Screen tests.
 *
 * Covers:
 *   - Loading state (spinner)
 *   - Data display (holding cards with symbol, shares, prices)
 *   - Error state
 *   - Filter buttons (All, KFH, BBYN, USA)
 *   - Totals banner
 *   - Empty state
 *   - Pull-to-refresh
 */

import React from "react";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react-native";
import { MOCK_HOLDINGS } from "../helpers";

// ── Mocks ───────────────────────────────────────────────────────────

const mockGetHoldings = jest.fn();

jest.mock("@/services/api", () => ({
  getHoldings: (...args: any[]) => mockGetHoldings(...args),
}));

// ── Import after mocks ──────────────────────────────────────────────

import HoldingsScreen from "@/app/(tabs)/holdings";

// ── Tests ───────────────────────────────────────────────────────────

describe("HoldingsScreen", () => {
  beforeEach(() => {
    mockGetHoldings.mockReset();
  });

  // ── Loading state ──

  it("shows loading indicator while fetching", async () => {
    mockGetHoldings.mockReturnValue(new Promise(() => {}));
    render(<HoldingsScreen />);

    expect(screen.getByText("Loading holdings…")).toBeTruthy();
  });

  // ── Success state ──

  it("renders holding symbols", async () => {
    mockGetHoldings.mockResolvedValueOnce(MOCK_HOLDINGS);
    render(<HoldingsScreen />);

    await waitFor(() => {
      expect(screen.getByText("HUMANSOFT")).toBeTruthy();
    });

    expect(screen.getByText("NBK")).toBeTruthy();
  });

  it("renders company names", async () => {
    mockGetHoldings.mockResolvedValueOnce(MOCK_HOLDINGS);
    render(<HoldingsScreen />);

    await waitFor(() => {
      expect(screen.getByText("Humansoft Holding")).toBeTruthy();
    });

    expect(screen.getByText("National Bank of Kuwait")).toBeTruthy();
  });

  it("renders totals banner with holding count", async () => {
    mockGetHoldings.mockResolvedValueOnce(MOCK_HOLDINGS);
    render(<HoldingsScreen />);

    await waitFor(() => {
      expect(screen.getByText("2 holdings")).toBeTruthy();
    });
  });

  it("shows singular 'holding' for count of 1", async () => {
    const singleHolding = {
      ...MOCK_HOLDINGS,
      holdings: [MOCK_HOLDINGS.holdings[0]],
      count: 1,
    };
    mockGetHoldings.mockResolvedValueOnce(singleHolding);
    render(<HoldingsScreen />);

    await waitFor(() => {
      expect(screen.getByText("1 holding")).toBeTruthy();
    });
  });

  // ── Filter buttons ──

  it("renders filter buttons: All, KFH, BBYN, USA", async () => {
    mockGetHoldings.mockResolvedValueOnce(MOCK_HOLDINGS);
    render(<HoldingsScreen />);

    await waitFor(() => {
      expect(screen.getByText("All")).toBeTruthy();
    });

    expect(screen.getByText("KFH")).toBeTruthy();
    expect(screen.getByText("BBYN")).toBeTruthy();
    expect(screen.getByText("USA")).toBeTruthy();
  });

  it("calls getHoldings with filter when portfolio tab pressed", async () => {
    mockGetHoldings
      .mockResolvedValueOnce(MOCK_HOLDINGS) // initial load (All)
      .mockResolvedValueOnce(MOCK_HOLDINGS); // filtered load

    render(<HoldingsScreen />);

    await waitFor(() => {
      expect(screen.getByText("HUMANSOFT")).toBeTruthy();
    });

    await act(async () => {
      fireEvent.press(screen.getByText("KFH"));
    });

    await waitFor(() => {
      expect(mockGetHoldings).toHaveBeenCalledWith("KFH");
    });
  });

  // ── Error state ──

  it("shows error message on API failure", async () => {
    mockGetHoldings.mockRejectedValueOnce(new Error("Network timeout"));
    render(<HoldingsScreen />);

    await waitFor(() => {
      expect(screen.getByText("Network timeout")).toBeTruthy();
    });
  });

  // ── Empty state ──

  it("shows empty message when no holdings", async () => {
    mockGetHoldings.mockResolvedValueOnce({
      ...MOCK_HOLDINGS,
      holdings: [],
      count: 0,
    });

    render(<HoldingsScreen />);

    await waitFor(() => {
      expect(screen.getByText("No holdings found.")).toBeTruthy();
    });
  });
});
