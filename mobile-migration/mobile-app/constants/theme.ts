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
  successBg: string;
  successText: string;
  warning: string;
  warningBg: string;
  warningText: string;
  danger: string;
  dangerBg: string;
  dangerText: string;

  // Chart palette
  chart: string[];

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
  textMuted: "#64748b",

  accentPrimary: "#6366f1",
  accentSecondary: "#3b82f6",
  accentTertiary: "#ec4899",

  success: "#10b981",
  successBg: "#d1fae5",
  successText: "#065f46",
  warning: "#f59e0b",
  warningBg: "#fef3c7",
  warningText: "#92400e",
  danger: "#ef4444",
  dangerBg: "#fee2e2",
  dangerText: "#991b1b",

  chart: ["#2563eb", "#7c3aed", "#db2777", "#ea580c", "#16a34a", "#0891b2", "#4f46e5", "#be123c"],

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
  successBg: "#064e3b",
  successText: "#6ee7b7",
  warning: "#ff9e00",
  warningBg: "#78350f",
  warningText: "#fcd34d",
  danger: "#ff4757",
  dangerBg: "#7f1d1d",
  dangerText: "#fca5a5",

  chart: ["#60a5fa", "#a78bfa", "#f472b6", "#fb923c", "#4ade80", "#22d3ee", "#818cf8", "#fb7185"],

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
