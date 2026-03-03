/**
 * Theme store (Zustand) — persists light/dark preference.
 *
 * On Web  → localStorage
 * On Native → AsyncStorage
 */

import { create } from "zustand";
import { Platform } from "react-native";
import { ThemePalette, LightTheme, DarkTheme, getTheme } from "@/constants/theme";

const STORAGE_KEY = "app_theme_mode";

// ── Persistence helpers ─────────────────────────────────────────────

async function loadMode(): Promise<"light" | "dark"> {
  try {
    if (Platform.OS === "web") {
      const v = localStorage.getItem(STORAGE_KEY);
      if (v === "light" || v === "dark") return v;
    } else {
      const AsyncStorage =
        require("@react-native-async-storage/async-storage").default;
      const v = await AsyncStorage.getItem(STORAGE_KEY);
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
      const AsyncStorage =
        require("@react-native-async-storage/async-storage").default;
      await AsyncStorage.setItem(STORAGE_KEY, mode);
    }
  } catch {}
}

// ── Store ───────────────────────────────────────────────────────────

interface ThemeState {
  mode: "light" | "dark";
  colors: ThemePalette;
  hydrated: boolean;
  hydrate: () => Promise<void>;
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
