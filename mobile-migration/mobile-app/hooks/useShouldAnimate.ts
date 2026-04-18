import { AccessibilityInfo } from "react-native";
import { useEffect, useState } from "react";

/**
 * Returns false when reduced-motion is enabled or datasets are heavy.
 * Helps keep animation subtle and avoids expensive decorative motion.
 */
export function useShouldAnimate(itemCount: number, heavyThreshold = 120): boolean {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (mounted) setReduceMotion(Boolean(enabled));
      })
      .catch(() => {
        if (mounted) setReduceMotion(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  return !reduceMotion && itemCount <= heavyThreshold;
}
