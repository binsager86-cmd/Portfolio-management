/**
 * Buffett Checklist — Persistence.
 *
 * Platform-aware storage (localStorage on web, expo-secure-store on native).
 * Follows the same pattern as alertRules.ts.
 */

import { Platform } from "react-native";

import { ASSESSMENT_VERSION, DEFAULT_SCALE } from "./config";
import type { BuffettAssessment, BuffettSector, HardCap, ScaleMode } from "./types";

const STORAGE_PREFIX = "buffett_assessment_";

function storageKey(stockId: number): string {
  return `${STORAGE_PREFIX}${stockId}`;
}

export async function loadAssessment(stockId: number): Promise<BuffettAssessment | null> {
  try {
    let raw: string | null = null;
    if (Platform.OS === "web") {
      raw = localStorage.getItem(storageKey(stockId));
    } else {
      const SecureStore = await import("expo-secure-store");
      raw = await SecureStore.getItemAsync(storageKey(stockId));
    }
    if (raw) return JSON.parse(raw) as BuffettAssessment;
  } catch (err) {
    if (__DEV__) console.warn("[BuffettChecklist] Failed to load:", err);
  }
  return null;
}

export async function saveAssessment(assessment: BuffettAssessment): Promise<void> {
  try {
    const raw = JSON.stringify(assessment);
    const key = storageKey(assessment.stockId);
    if (Platform.OS === "web") {
      localStorage.setItem(key, raw);
    } else {
      const SecureStore = await import("expo-secure-store");
      await SecureStore.setItemAsync(key, raw);
    }
  } catch (err) {
    if (__DEV__) console.warn("[BuffettChecklist] Failed to save:", err);
  }
}

export async function deleteAssessment(stockId: number): Promise<void> {
  try {
    const key = storageKey(stockId);
    if (Platform.OS === "web") {
      localStorage.removeItem(key);
    } else {
      const SecureStore = await import("expo-secure-store");
      await SecureStore.deleteItemAsync(key);
    }
  } catch (err) {
    if (__DEV__) console.warn("[BuffettChecklist] Failed to delete:", err);
  }
}

export function createEmptyAssessment(
  stockId: number,
  sector: BuffettSector,
  scaleMode: ScaleMode = DEFAULT_SCALE,
): BuffettAssessment {
  return {
    stockId,
    assessmentVersion: ASSESSMENT_VERSION,
    selectedScaleMode: scaleMode,
    sectorUsed: sector,
    qualitativeAnswers: {},
    qualitativeNotes: {},
    computedRawScore: 0,
    computedFinalScore: 0,
    activeCaps: [],
    dataCoveragePercent: 0,
    updatedAt: Date.now(),
  };
}

/** Update assessment with new computed results. */
export function updateAssessmentScores(
  assessment: BuffettAssessment,
  rawScore: number,
  finalScore: number,
  caps: HardCap[],
  coverage: number,
): BuffettAssessment {
  return {
    ...assessment,
    computedRawScore: rawScore,
    computedFinalScore: finalScore,
    activeCaps: caps,
    dataCoveragePercent: coverage,
    updatedAt: Date.now(),
  };
}
