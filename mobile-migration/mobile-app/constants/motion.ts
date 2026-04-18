/**
 * Motion — unified animation timing system for the entire app.
 *
 * One source of truth for durations, easings, and spring configs.
 * Keeps motion subtle and consistent: short for interactions,
 * medium for section entrances, long reserved for hero charts only.
 *
 * Usage:
 *   import { Motion } from "@/constants/motion";
 *   withTiming(1, { duration: Motion.duration.normal, easing: Motion.easing.standard });
 *   withSpring(1, Motion.spring.gentle);
 */

import { Easing } from "react-native-reanimated";

export const Motion = {
  // ── Duration tiers (ms) ──────────────────────────────────────
  duration: {
    /** Micro-interactions: button press, toggle, chip select */
    instant: 120,
    /** Standard transitions: fade, slide, collapse */
    normal: 220,
    /** Section entrance, skeleton → content swap */
    entrance: 350,
    /** Charts & hero animations (use sparingly) */
    chart: 600,
    /** Reset/exit before re-entrance */
    reset: 150,
  },

  // ── Easing presets ───────────────────────────────────────────
  easing: {
    /** Default for most transitions */
    standard: Easing.out(Easing.cubic),
    /** Entrances — starts slow, accelerates in */
    enter: Easing.out(Easing.quad),
    /** Exits — starts fast, decelerates out */
    exit: Easing.in(Easing.quad),
  },

  // ── Spring presets ───────────────────────────────────────────
  spring: {
    /** Press feedback, small UI elements */
    snappy: { damping: 15, stiffness: 300, mass: 0.8 },
    /** Page transitions, drawers, modals */
    gentle: { damping: 20, stiffness: 180, mass: 1 },
    /** Tab indicator, layout shifts */
    smooth: { damping: 25, stiffness: 150, mass: 1 },
  },

  // ── Stagger delay for list/section entrances ─────────────────
  stagger: {
    /** Delay between items in a list entrance */
    item: 40,
    /** Delay between sections on a screen */
    section: 80,
    /** Max total stagger (cap to avoid sluggish feel) */
    maxTotal: 300,
  },
} as const;

/** Convenience: standard withTiming config */
export const TIMING_NORMAL = {
  duration: Motion.duration.normal,
  easing: Motion.easing.standard,
} as const;

/** Convenience: entrance withTiming config */
export const TIMING_ENTRANCE = {
  duration: Motion.duration.entrance,
  easing: Motion.easing.enter,
} as const;

/** Convenience: chart withTiming config */
export const TIMING_CHART = {
  duration: Motion.duration.chart,
  easing: Motion.easing.standard,
} as const;
