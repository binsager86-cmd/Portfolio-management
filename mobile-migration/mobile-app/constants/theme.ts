/**
 * Theme system — Light & Dark palettes matching the legacy Streamlit app.
 *
 * Light: white cards on slate-50 background  (Streamlit default)
 * Dark:  deep-navy cards with neon accents    (Streamlit "dark mode")
 *
 * The active theme is stored in Zustand (themeStore) and persisted
 * to AsyncStorage / localStorage.
 */

export interface ThemePalette {
  mode: "light" | "dark";

  // Backgrounds
  bgPrimary: string;
  bgSecondary: string;
  bgCard: string;
  bgCardHover: string;
  bgInput: string;

  // Text
  textPrimary: string;
  textSecondary: string;
  textMuted: string;

  // Accents
  accentPrimary: string;   // main brand colour
  accentSecondary: string; // secondary accent (blue)
  accentTertiary: string;  // tertiary (pink/magenta)

  // Semantic
  success: string;
  warning: string;
  danger: string;

  // Chrome
  borderColor: string;
  cardShadowColor: string;
  tabBarBg: string;
  tabBarBorder: string;
  headerBg: string;
}

/** Light theme — matches Streamlit's default light CSS vars. */
export const LightTheme: ThemePalette = {
  mode: "light",

  bgPrimary: "#f8fafc",
  bgSecondary: "#ffffff",
  bgCard: "#ffffff",
  bgCardHover: "#f1f5f9",
  bgInput: "#f1f5f9",

  textPrimary: "#1e293b",
  textSecondary: "#64748b",
  textMuted: "#94a3b8",

  accentPrimary: "#6366f1",
  accentSecondary: "#3b82f6",
  accentTertiary: "#ec4899",

  success: "#10b981",
  warning: "#f59e0b",
  danger: "#ef4444",

  borderColor: "rgba(203,213,225,0.6)",
  cardShadowColor: "rgba(0,0,0,0.06)",
  tabBarBg: "#ffffff",
  tabBarBorder: "#e2e8f0",
  headerBg: "#ffffff",
};

/** Dark theme — matches Streamlit's "dark / neon" CSS vars. */
export const DarkTheme: ThemePalette = {
  mode: "dark",

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
};

/** Convenience: get the palette for a mode string. */
export function getTheme(mode: "light" | "dark"): ThemePalette {
  return mode === "light" ? LightTheme : DarkTheme;
}
