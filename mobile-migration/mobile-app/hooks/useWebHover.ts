/**
 * useWebHover — tracks hover state for web; always false on native.
 *
 * Usage:
 *   const [hovered, hoverProps] = useWebHover();
 *   <View {...hoverProps} style={[baseStyle, hovered && hoveredStyle]} />
 */

import { useCallback, useState } from "react";
import { Platform } from "react-native";

type WebHoverProps = Platform["OS"] extends "web"
  ? { onMouseEnter: () => void; onMouseLeave: () => void }
  : Record<string, never>;

export function useWebHover(): [boolean, Record<string, any>] {
  const [hovered, setHovered] = useState(false);

  const onMouseEnter = useCallback(() => setHovered(true), []);
  const onMouseLeave = useCallback(() => setHovered(false), []);

  if (Platform.OS !== "web") return [false, {}];

  return [hovered, { onMouseEnter, onMouseLeave }];
}
