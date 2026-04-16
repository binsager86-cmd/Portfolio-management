/**
 * UITokens — Centralised design tokens for spacing, radius, typography, and shadows.
 * Import these instead of hardcoding numbers throughout the app.
 */

export const UITokens = {
  spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 } as const,
  radius: { sm: 6, md: 12, lg: 16, xl: 24, pill: 9999 } as const,
  typography: {
    hero: { size: 32, weight: "700" as const, lineHeight: 40 },
    title: { size: 20, weight: "600" as const, lineHeight: 28 },
    body: { size: 15, weight: "400" as const, lineHeight: 22 },
    caption: { size: 12, weight: "500" as const, lineHeight: 16 },
    min: 14, // Enforced minimum for accessibility
  },
  shadows: {
    card: { shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 2 },
    elevated: { shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 16, elevation: 4 },
    floating: { shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.18, shadowRadius: 24, elevation: 8 },
  },
  haptics: { light: "Light", medium: "Medium", success: "Success", error: "Error" } as const,
} as const;
