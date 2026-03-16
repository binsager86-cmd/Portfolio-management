/**
 * Theme store (Zustand) — persists light/dark preference.
 *
 * On Web    → localStorage (sync)
 * On Native → expo-secure-store (async, Expo Go compatible)
 */

import { Platform } from "react-native";
import { create } from "zustand";

import { DarkTheme, getTheme, ThemePalette } from "@/constants/theme";

const STORAGE_KEY = "app_theme_mode";

// ── Persistence helpers ─────────────────────────────────────────────

async function loadMode(): Promise<"light" | "dark"> {
  try {
    if (Platform.OS === "web") {
      const v = localStorage.getItem(STORAGE_KEY);
      if (v === "light" || v === "dark") return v;
    } else {
      const SecureStore = await import("expo-secure-store");
      const v = await SecureStore.getItemAsync(STORAGE_KEY);
      if (v === "light" || v === "dark") return v;
    }
  } catch {}
  return "dark"; // default
}

async function saveMode(mode: "light" | "dark"): Promise<void> {
  try {
    if (Platform.OS === "web") {
      localStorage.setItem(STORAGE_KEY, mode);
    } else {
      const SecureStore = await import("expo-secure-store");
      await SecureStore.setItemAsync(STORAGE_KEY, mode);
    }
  } catch {}
}

// ── Store ───────────────────────────────────────────────────────────

interface ThemeState {
  mode: "light" | "dark";
  colors: ThemePalette;
  hydrated: boolean;
  hydrate: () => void;
  toggle: () => void;
  setMode: (m: "light" | "dark") => void;
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  mode: "dark",
  colors: DarkTheme,
  hydrated: false,

  hydrate: async () => {
    const m = await loadMode();
    set({ mode: m, colors: getTheme(m), hydrated: true });
  },

  toggle: () => {
    const next = get().mode === "dark" ? "light" : "dark";
    set({ mode: next, colors: getTheme(next) });
    saveMode(next);
  },

  setMode: (m) => {
    set({ mode: m, colors: getTheme(m) });
    saveMode(m);
  },
}));
