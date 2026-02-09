import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      /* ── Fintech Color Palette ─────────────────────────── */
      colors: {
        brand: {
          50: "#f0f4ff",
          100: "#dbe4ff",
          200: "#bac8ff",
          300: "#91a7ff",
          400: "#748ffc",
          500: "#5c7cfa",
          600: "#4c6ef5",
          700: "#4263eb",
          800: "#3b5bdb",
          900: "#0F172A", // primary – dark navy
          950: "#0a1021",
        },
        surface: {
          DEFAULT: "#F8FAFC",   // page background
          card: "#FFFFFF",      // card bg
          raised: "#F1F5F9",    // slightly elevated
          border: "#E2E8F0",    // default border
          muted: "#94A3B8",     // muted text / labels
        },
        success: {
          DEFAULT: "#10B981",
          light: "#D1FAE5",
          dark: "#065F46",
        },
        danger: {
          DEFAULT: "#EF4444",
          light: "#FEE2E2",
          dark: "#991B1B",
        },
        warning: {
          DEFAULT: "#F59E0B",
          light: "#FEF3C7",
          dark: "#92400E",
        },
        info: {
          DEFAULT: "#3B82F6",
          light: "#DBEAFE",
          dark: "#1E40AF",
        },
      },

      /* ── Typography ────────────────────────────────────── */
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "sans-serif",
        ],
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
      },
      fontSize: {
        "kpi": ["2rem", { lineHeight: "1.2", fontWeight: "700" }],
        "kpi-label": ["0.75rem", { lineHeight: "1", fontWeight: "600", letterSpacing: "0.05em" }],
      },

      /* ── Border Radius ─────────────────────────────────── */
      borderRadius: {
        lg: "0.75rem",      // 12px – cards
        md: "0.5rem",       // 8px  – buttons
        sm: "0.375rem",     // 6px  – badges
        xl: "1rem",         // 16px – hero cards
        "2xl": "1.25rem",   // 20px – large panels
      },

      /* ── Shadows ───────────────────────────────────────── */
      boxShadow: {
        "card": "0 1px 3px 0 rgb(0 0 0 / 0.04), 0 1px 2px -1px rgb(0 0 0 / 0.04)",
        "card-hover": "0 10px 15px -3px rgb(0 0 0 / 0.06), 0 4px 6px -4px rgb(0 0 0 / 0.04)",
        "kpi": "0 4px 6px -1px rgb(0 0 0 / 0.05), 0 2px 4px -2px rgb(0 0 0 / 0.03)",
        "nav": "0 1px 2px 0 rgb(0 0 0 / 0.03)",
      },

      /* ── Animations ────────────────────────────────────── */
      keyframes: {
        "fade-in": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "slide-in-left": {
          "0%": { opacity: "0", transform: "translateX(-12px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.4s ease-out",
        "slide-in-left": "slide-in-left 0.3s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
