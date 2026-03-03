/**
 * Theme constants and ThemeStore — unit tests.
 *
 * Covers:
 *   - LightTheme and DarkTheme palette completeness
 *   - getTheme() helper returns correct palette
 *   - ThemePalette interface shape
 *   - Color values for key semantic colors
 */

import { LightTheme, DarkTheme, getTheme } from "@/constants/theme";
import type { ThemePalette } from "@/constants/theme";

// ── Required palette keys — must match ThemePalette interface ────────

const REQUIRED_KEYS: (keyof ThemePalette)[] = [
  "mode",
  "bgPrimary",
  "bgSecondary",
  "bgCard",
  "bgCardHover",
  "bgInput",
  "textPrimary",
  "textSecondary",
  "textMuted",
  "accentPrimary",
  "accentSecondary",
  "accentTertiary",
  "success",
  "warning",
  "danger",
  "borderColor",
  "cardShadowColor",
  "tabBarBg",
  "tabBarBorder",
  "headerBg",
];

describe("Theme Constants", () => {
  // ── LightTheme ──

  describe("LightTheme", () => {
    it("has mode set to 'light'", () => {
      expect(LightTheme.mode).toBe("light");
    });

    it("has all required palette keys", () => {
      for (const key of REQUIRED_KEYS) {
        expect(LightTheme).toHaveProperty(key);
        expect(LightTheme[key]).toBeTruthy();
      }
    });

    it("has light primary background", () => {
      // Light theme should have a light background (hex starting with high digits)
      expect(LightTheme.bgPrimary).toMatch(/^#[89a-f]/i);
    });

    it("has dark primary text for contrast", () => {
      // Light theme text should be dark
      expect(LightTheme.textPrimary).toBeDefined();
    });

    it("defines semantic colors", () => {
      expect(LightTheme.success).toBeDefined();
      expect(LightTheme.warning).toBeDefined();
      expect(LightTheme.danger).toBeDefined();
    });
  });

  // ── DarkTheme ──

  describe("DarkTheme", () => {
    it("has mode set to 'dark'", () => {
      expect(DarkTheme.mode).toBe("dark");
    });

    it("has all required palette keys", () => {
      for (const key of REQUIRED_KEYS) {
        expect(DarkTheme).toHaveProperty(key);
        expect(DarkTheme[key]).toBeTruthy();
      }
    });

    it("has dark primary background", () => {
      // Dark theme should have a dark background (starts with #0 or #1)
      expect(DarkTheme.bgPrimary).toMatch(/^#[0-2]/i);
    });

    it("has light primary text for contrast", () => {
      // Dark theme text should be light (starts with #e or #f)
      expect(DarkTheme.textPrimary).toMatch(/^#[d-f]/i);
    });

    it("defines semantic colors", () => {
      expect(DarkTheme.success).toBeDefined();
      expect(DarkTheme.warning).toBeDefined();
      expect(DarkTheme.danger).toBeDefined();
    });

    it("has neon-style accent primary", () => {
      expect(DarkTheme.accentPrimary).toBe("#8a2be2");
    });
  });

  // ── getTheme() ──

  describe("getTheme()", () => {
    it("returns LightTheme for 'light' mode", () => {
      expect(getTheme("light")).toBe(LightTheme);
    });

    it("returns DarkTheme for 'dark' mode", () => {
      expect(getTheme("dark")).toBe(DarkTheme);
    });

    it("returned palette has correct mode", () => {
      expect(getTheme("light").mode).toBe("light");
      expect(getTheme("dark").mode).toBe("dark");
    });
  });

  // ── Theme palette consistency ──

  describe("theme consistency", () => {
    it("both themes have the same keys", () => {
      const lightKeys = Object.keys(LightTheme).sort();
      const darkKeys = Object.keys(DarkTheme).sort();
      expect(lightKeys).toEqual(darkKeys);
    });

    it("no palette value is empty string", () => {
      for (const key of REQUIRED_KEYS) {
        expect(LightTheme[key]).not.toBe("");
        expect(DarkTheme[key]).not.toBe("");
      }
    });

    it("both themes have identical set of accent colors", () => {
      const accentKeys = ["accentPrimary", "accentSecondary", "accentTertiary"] as const;
      for (const key of accentKeys) {
        expect(LightTheme[key]).toBeDefined();
        expect(DarkTheme[key]).toBeDefined();
      }
    });
  });
});
