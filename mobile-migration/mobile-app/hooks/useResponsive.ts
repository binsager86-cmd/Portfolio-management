/**
 * useResponsive — returns layout breakpoint info, spacing, and typography scale.
 *
 * Breakpoints (matches requirement):
 *   Mobile  : < 768 px
 *   Tablet  : 768 – 1024 px
 *   Desktop : > 1024 px
 *
 * Also exposes helpers for responsive padding, font sizes, grid columns,
 * max-content width, sidebar visibility, and touch-target sizing.
 */

import { useWindowDimensions, Platform } from "react-native";

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

  /** Whether to show the persistent sidebar (web desktop/tablet) */
  showSidebar: boolean;

  /** Whether to show a hamburger button (mobile + tablet web) */
  showHamburger: boolean;

  /** Minimum touch target in px (44 on phone/tablet) */
  touchTarget: number;

  /** Spacing & font presets */
  spacing: SpacingPreset;
  fonts: FontPreset;
}

export function useResponsive(): ResponsiveInfo {
  const { width, height } = useWindowDimensions();

  let bp: Breakpoint = "phone";
  if (width >= BP_DESKTOP) bp = "desktop";
  else if (width >= BP_TABLET) bp = "tablet";

  const isPhone = bp === "phone";
  const isTablet = bp === "tablet";
  const isDesktop = bp === "desktop";

  // Sidebar: only on web when ≥ tablet
  const showSidebar = Platform.OS === "web" && (isDesktop || isTablet);

  // Hamburger: shown on phone (any platform) or on web tablet (sidebar can be toggled)
  const showHamburger = isPhone;

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
