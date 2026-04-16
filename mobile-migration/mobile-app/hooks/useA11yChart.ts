import { useMemo } from "react";

/**
 * Converts chart data into accessible props for screen readers.
 * Spread the result onto the wrapping View so VoiceOver / TalkBack
 * reads precise values instead of "SVG graphic".
 */
export const useA11yChart = (data: { label: string; value: number }[]) => {
  return useMemo(() => {
    const total = data.reduce((s, d) => s + d.value, 0);
    const summary = data
      .map(
        (d) =>
          `${d.label}: ${d.value} (${((d.value / total) * 100).toFixed(1)}%)`,
      )
      .join(". ");

    return {
      accessibilityLabel: `Financial distribution chart. ${summary}`,
      role: "img" as const,
      importantForAccessibility: "yes" as const,
    };
  }, [data]);
};
