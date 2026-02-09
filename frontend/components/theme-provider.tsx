"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";

/* ── Types ─────────────────────────────────────────────── */
type Theme = "light" | "dark";

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (t: Theme) => void;
  privacyMode: boolean;
  togglePrivacy: () => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

/* ── Provider ──────────────────────────────────────────── */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("light");
  const [privacyMode, setPrivacyMode] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Hydrate from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem("portfolio-theme") as Theme | null;
    if (saved === "dark" || saved === "light") {
      setThemeState(saved);
    } else if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
      setThemeState("dark");
    }

    const savedPrivacy = localStorage.getItem("portfolio-privacy");
    if (savedPrivacy === "true") setPrivacyMode(true);

    setMounted(true);
  }, []);

  // Sync <html> class + localStorage whenever theme changes
  useEffect(() => {
    if (!mounted) return;
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    localStorage.setItem("portfolio-theme", theme);
  }, [theme, mounted]);

  // Sync privacy to localStorage
  useEffect(() => {
    if (!mounted) return;
    localStorage.setItem("portfolio-privacy", String(privacyMode));
  }, [privacyMode, mounted]);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => (prev === "dark" ? "light" : "dark"));
  }, []);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
  }, []);

  const togglePrivacy = useCallback(() => {
    setPrivacyMode((prev) => !prev);
  }, []);

  // Prevent flash of wrong theme (hide visually until hydrated, but always
  // render the Provider so child `useTheme()` hooks work during SSR).
  return (
    <ThemeContext.Provider
      value={{ theme, toggleTheme, setTheme, privacyMode, togglePrivacy }}
    >
      {mounted ? children : <div style={{ visibility: "hidden" }}>{children}</div>}
    </ThemeContext.Provider>
  );
}

/* ── Hook ──────────────────────────────────────────────── */
export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within <ThemeProvider>");
  return ctx;
}
