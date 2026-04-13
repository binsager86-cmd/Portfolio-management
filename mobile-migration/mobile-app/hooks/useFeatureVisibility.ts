import { useUserPrefsStore, type ExpertiseLevel } from "@/src/store/userPrefsStore";

const LEVEL_ORDER: ExpertiseLevel[] = ["normal", "intermediate", "advanced"];

export function useFeatureVisibility() {
  const expertiseLevel = useUserPrefsStore((s) => s.preferences.expertiseLevel);

  const isNormal = expertiseLevel === "normal";
  const isIntermediate = expertiseLevel === "intermediate";
  const isAdvanced = expertiseLevel === "advanced";

  /** Returns true if the user's level meets or exceeds the minimum */
  const hasAccess = (minLevel: ExpertiseLevel): boolean =>
    LEVEL_ORDER.indexOf(expertiseLevel) >= LEVEL_ORDER.indexOf(minLevel);

  return { expertiseLevel, isNormal, isIntermediate, isAdvanced, hasAccess };
}
