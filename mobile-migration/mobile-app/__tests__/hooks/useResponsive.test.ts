/**
 * useResponsive hook — unit tests.
 *
 * Covers:
 *   - Phone breakpoint (< 600px)
 *   - Tablet breakpoint (600–1023px)
 *   - Desktop breakpoint (≥ 1024px)
 *   - Metric column counts per breakpoint
 *   - Boolean flags
 */

import { renderHook } from "@testing-library/react-native";
import { useWindowDimensions } from "react-native";

// We need to mock useWindowDimensions to control viewport size
let mockDimensions = { width: 375, height: 812 };

jest.mock("react-native", () => {
  const actual = jest.requireActual("react-native");
  // Only override useWindowDimensions; keep everything else via proxy
  return new Proxy(actual, {
    get(target, prop) {
      if (prop === "useWindowDimensions") {
        return () => mockDimensions;
      }
      return target[prop];
    },
  });
});

import { useResponsive, Breakpoint } from "@/hooks/useResponsive";

describe("useResponsive", () => {
  afterEach(() => {
    mockDimensions = { width: 375, height: 812 };
  });

  // ── Phone breakpoint ──

  it("returns phone breakpoint for width < 600", () => {
    mockDimensions = { width: 375, height: 812 };
    const { result } = renderHook(() => useResponsive());

    expect(result.current.bp).toBe("phone");
    expect(result.current.isPhone).toBe(true);
    expect(result.current.isTablet).toBe(false);
    expect(result.current.isDesktop).toBe(false);
  });

  it("returns 2 metric columns for phone", () => {
    mockDimensions = { width: 375, height: 812 };
    const { result } = renderHook(() => useResponsive());
    expect(result.current.metricCols).toBe(2);
  });

  it("returns phone for minimum width", () => {
    mockDimensions = { width: 320, height: 568 };
    const { result } = renderHook(() => useResponsive());
    expect(result.current.bp).toBe("phone");
  });

  it("returns phone at width 599", () => {
    mockDimensions = { width: 599, height: 900 };
    const { result } = renderHook(() => useResponsive());
    expect(result.current.bp).toBe("phone");
  });

  // ── Tablet breakpoint ──

  it("returns tablet breakpoint for width 600", () => {
    mockDimensions = { width: 600, height: 900 };
    const { result } = renderHook(() => useResponsive());

    expect(result.current.bp).toBe("tablet");
    expect(result.current.isPhone).toBe(false);
    expect(result.current.isTablet).toBe(true);
    expect(result.current.isDesktop).toBe(false);
  });

  it("returns 3 metric columns for tablet", () => {
    mockDimensions = { width: 768, height: 1024 };
    const { result } = renderHook(() => useResponsive());
    expect(result.current.metricCols).toBe(3);
  });

  it("returns tablet at width 1023", () => {
    mockDimensions = { width: 1023, height: 900 };
    const { result } = renderHook(() => useResponsive());
    expect(result.current.bp).toBe("tablet");
  });

  // ── Desktop breakpoint ──

  it("returns desktop breakpoint for width ≥ 1024", () => {
    mockDimensions = { width: 1024, height: 768 };
    const { result } = renderHook(() => useResponsive());

    expect(result.current.bp).toBe("desktop");
    expect(result.current.isPhone).toBe(false);
    expect(result.current.isTablet).toBe(false);
    expect(result.current.isDesktop).toBe(true);
  });

  it("returns 5 metric columns for desktop", () => {
    mockDimensions = { width: 1440, height: 900 };
    const { result } = renderHook(() => useResponsive());
    expect(result.current.metricCols).toBe(5);
  });

  it("returns desktop for large screens", () => {
    mockDimensions = { width: 1920, height: 1080 };
    const { result } = renderHook(() => useResponsive());
    expect(result.current.bp).toBe("desktop");
  });

  // ── Width/height pass-through ──

  it("passes through width and height", () => {
    mockDimensions = { width: 414, height: 896 };
    const { result } = renderHook(() => useResponsive());

    expect(result.current.width).toBe(414);
    expect(result.current.height).toBe(896);
  });
});
