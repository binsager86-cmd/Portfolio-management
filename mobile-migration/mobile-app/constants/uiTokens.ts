/**
 * UITokens — Centralised design tokens for spacing, radius, typography,
 * shadows, and component-level design system presets.
 *
 * Import these instead of hardcoding numbers throughout the app.
 * Every card, button, modal, filter, metric card, and empty state
 * should reference these tokens so the whole app looks consistent.
 */

export const UITokens = {
  // ── Spacing scale ───────────────────────────────────────────────
  spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 } as const,

  // ── Border radius system ────────────────────────────────────────
  radius: { sm: 6, md: 12, lg: 16, xl: 24, pill: 9999 } as const,

  // ── Typography scale ────────────────────────────────────────────
  typography: {
    hero: { size: 32, weight: "700" as const, lineHeight: 40 },
    title: { size: 20, weight: "600" as const, lineHeight: 28 },
    subtitle: { size: 16, weight: "700" as const, lineHeight: 22 },
    body: { size: 15, weight: "400" as const, lineHeight: 22 },
    caption: { size: 12, weight: "500" as const, lineHeight: 16 },
    label: { size: 11, weight: "700" as const, lineHeight: 14, letterSpacing: 0.8 },
    min: 14, // Enforced minimum for accessibility
  },

  // ── Elevation / shadows ─────────────────────────────────────────
  shadows: {
    card: { shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 2 },
    elevated: { shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 16, elevation: 4 },
    floating: { shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.18, shadowRadius: 24, elevation: 8 },
  },

  // ── Card system — ONE card style everywhere ─────────────────────
  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
  },

  // ── Button hierarchy ────────────────────────────────────────────
  button: {
    primary: {
      height: 48,
      borderRadius: 12,
      paddingHorizontal: 24,
      fontSize: 16,
      fontWeight: "700" as const,
    },
    secondary: {
      height: 44,
      borderRadius: 12,
      paddingHorizontal: 20,
      borderWidth: 1.5,
      fontSize: 15,
      fontWeight: "600" as const,
    },
    ghost: {
      height: 40,
      borderRadius: 8,
      paddingHorizontal: 16,
      fontSize: 14,
      fontWeight: "600" as const,
    },
  },

  // ── Filter chip / bar ───────────────────────────────────────────
  filter: {
    chipHeight: 36,
    chipPaddingH: 14,
    chipRadius: 18,
    chipFontSize: 13,
    chipFontWeight: "600" as const,
    barPaddingH: 16,
    barPaddingV: 8,
    barGap: 8,
  },

  // ── Metric card (KPI tiles) ─────────────────────────────────────
  metric: {
    minHeight: 110,
    accentBarHeight: 3,
    iconSize: { phone: 18, desktop: 20 },
    labelSize: { phone: 11, desktop: 12 },
    valueSize: { phone: 15, desktop: 17 },
  },

  // ── Modal / bottom sheet ────────────────────────────────────────
  modal: {
    borderRadius: 20,
    padding: 24,
    backdropOpacity: 0.5,
    maxWidth: 480,
  },

  // ── Error / retry pattern ───────────────────────────────────────
  error: {
    iconSize: 48,
    titleSize: 16,
    retryButtonRadius: 8,
    retryButtonPaddingH: 24,
    retryButtonPaddingV: 10,
  },

  // ── Empty state pattern ─────────────────────────────────────────
  empty: {
    iconBoxSize: 100,
    iconSize: 48,
    titleSize: 20,
    descSize: 15,
    descLineHeight: 22,
    padding: 32,
    maxTipWidth: 320,
  },

  // ── Haptic feedback identifiers ─────────────────────────────────
  haptics: { light: "Light", medium: "Medium", success: "Success", error: "Error" } as const,

  /** Minimum touch target sizes per platform (Apple HIG: 44pt, Material: 48dp) */
  touchTarget: { mobile: 44, desktop: 36 } as const,

  /** Standard hitSlop values for small interactive elements */
  hitSlop: { sm: 8, md: 12, lg: 16 } as const,
} as const;
