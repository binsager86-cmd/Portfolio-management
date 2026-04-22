/**
 * useResponsive — returns layout breakpoint info, spacing, and typography scale.
 *
 * Breakpoints (matches requirement):
 *   Mobile  : < 768 px
 *   Tablet  : 768 – 1024 px
 *   Desktop : > 1024 px
 *
 * Also exposes helpers for responsive padding, font sizes, grid columns,
 * max-content width, navigation mode, and touch-target sizing.
 */

import { Platform, useWindowDimensions } from "react-native";

// ── Breakpoints ─────────────────────────────────────────────────────
export const BP_TABLET = 768;
export const BP_DESKTOP = 1025; // > 1024

export type Breakpoint = "phone" | "tablet" | "desktop";

// ── Spacing presets per breakpoint ──────────────────────────────────
export interface SpacingPreset {
  /** Horizontal page padding */
  pagePx: number;
  /** Vertical section gap */
  sectionGap: number;
  /** Gap between grid items */
  gridGap: number;
  /** Card internal padding */
  cardPadding: number;
}

const SPACING: Record<Breakpoint, SpacingPreset> = {
  phone:   { pagePx: 16, sectionGap: 16, gridGap: 10, cardPadding: 14 },
  tablet:  { pagePx: 24, sectionGap: 20, gridGap: 12, cardPadding: 16 },
  desktop: { pagePx: 32, sectionGap: 24, gridGap: 14, cardPadding: 18 },
};

// ── Font-size presets (all ≥ 14 px on mobile for readability) ───────
export interface FontPreset {
  /** Headline / hero value */
  hero: number;
  /** Page / section title */
  title: number;
  /** Body / metric value */
  body: number;
  /** Secondary / muted */
  caption: number;
  /** Smallest allowed */
  min: number;
}

const FONTS: Record<Breakpoint, FontPreset> = {
  phone:   { hero: 28, title: 18, body: 15, caption: 13, min: 14 },
  tablet:  { hero: 32, title: 20, body: 16, caption: 13, min: 13 },
  desktop: { hero: 36, title: 22, body: 16, caption: 13, min: 12 },
};

// ── Main hook ───────────────────────────────────────────────────────
export interface ResponsiveInfo {
  /** Raw viewport dimensions */
  width: number;
  height: number;

  /** Current breakpoint name */
  bp: Breakpoint;
  isPhone: boolean;
  isTablet: boolean;
  isDesktop: boolean;

  /** Number of columns for a metric grid (2 / 3 / 5) */
  metricCols: number;

  /** Max content width (for centered layouts on desktop) */
  maxContentWidth: number;

  /** Whether to show the persistent sidebar (web tablet/desktop only) */
  showSidebar: boolean;

  /** Whether to show a hamburger button (all native + web phone) */
  showHamburger: boolean;

  /** Minimum touch target in px (44 on phone/tablet) */
  touchTarget: number;

  /** Spacing & font presets */
  spacing: SpacingPreset;
  fonts: FontPreset;
}

export function useResponsive(): ResponsiveInfo {
  const { width, height } = useWindowDimensions();

  // Use the smaller dimension to determine device class (works in both orientations)
  const shortSide = Math.min(width, height);

  let bp: Breakpoint = "phone";
  if (width >= BP_DESKTOP) bp = "desktop";
  else if (width >= BP_TABLET) bp = "tablet";
  // Native devices: if the short side (portrait width) is ≥ 600px, it's a tablet
  // (iPads, Android tablets in portrait mode, even if current width < 768 in split-view)
  else if (Platform.OS !== "web" && shortSide >= 600) bp = "tablet";

  const isPhone = bp === "phone";
  const isTablet = bp === "tablet";
  const isDesktop = bp === "desktop";

  // Keep native platforms in drawer mode for consistent mobile app navigation.
  const showSidebar = Platform.OS === "web" && (isDesktop || isTablet);

  // Hamburger: shown whenever there's no persistent sidebar.
  const showHamburger = !showSidebar;

  return {
    width,
    height,
    bp,
    isPhone,
    isTablet,
    isDesktop,
    metricCols: isDesktop ? 5 : isTablet ? 3 : 2,
    maxContentWidth: isDesktop ? 1200 : isTablet ? 900 : width,
    showSidebar,
    showHamburger,
    touchTarget: isDesktop ? 36 : 44,
    spacing: SPACING[bp],
    fonts: FONTS[bp],
  };
}
