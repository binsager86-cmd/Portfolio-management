/**
 * Theme store (Zustand) — persists light/dark preference.
 *
 * On Web  → localStorage
 * On Native → MMKV (fast synchronous storage)
 */

import { Platform } from "react-native";
import { create } from "zustand";

import { ThemePalette, DarkTheme, getTheme } from "@/constants/theme";

const STORAGE_KEY = "app_theme_mode";

// ── MMKV instance (native only) ────────────────────────────────────

let mmkv: import("react-native-mmkv").MMKV | null = null;
if (Platform.OS !== "web") {
  const { MMKV } = require("react-native-mmkv");
  mmkv = new MMKV({ id: "theme-storage" });
}

// ── Persistence helpers ─────────────────────────────────────────────

function loadMode(): "light" | "dark" {
  try {
    if (Platform.OS === "web") {
      const v = localStorage.getItem(STORAGE_KEY);
      if (v === "light" || v === "dark") return v;
    } else if (mmkv) {
      const v = mmkv.getString(STORAGE_KEY);
      if (v === "light" || v === "dark") return v;
    }
  } catch {}
  return "dark"; // default
}

function saveMode(mode: "light" | "dark"): void {
  try {
    if (Platform.OS === "web") {
      localStorage.setItem(STORAGE_KEY, mode);
    } else if (mmkv) {
      mmkv.set(STORAGE_KEY, mode);
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

  hydrate: () => {
    const m = loadMode();
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
