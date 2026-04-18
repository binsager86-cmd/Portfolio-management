import React from "react";
import { Platform, Pressable, StyleSheet, type ViewStyle } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

import { Motion } from "@/constants/motion";
import { UITokens } from "@/constants/uiTokens";
import { useHaptics } from "@/hooks/useHaptics";
import { useThemeStore } from "@/services/themeStore";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export const PressableCard: React.FC<{
  onPress?: () => void;
  children: React.ReactNode;
  style?: ViewStyle;
  disabled?: boolean;
  testID?: string;
  accessibilityLabel?: string;
}> = ({ onPress, children, style, disabled, testID, accessibilityLabel }) => {
  const { colors } = useThemeStore();
  const haptics = useHaptics();
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    if (disabled) return;
    scale.value = withSpring(0.97, Motion.spring.snappy);
    haptics.light();
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, Motion.spring.snappy);
  };

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
      testID={testID}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      style={({ hovered }: any) => [
        styles.base,
        UITokens.shadows.card,
        { backgroundColor: hovered && !disabled ? colors.bgCardHover : colors.bgCard },
        animatedStyle,
        Platform.OS === "web" && ({
          cursor: onPress && !disabled ? "pointer" : "default",
          transition: "background-color 0.15s, transform 0.15s",
        } as any),
        style,
      ]}
    >
      {children}
    </AnimatedPressable>
  );
};

const styles = StyleSheet.create({
  base: {
    borderRadius: UITokens.radius.lg,
    padding: UITokens.spacing.md,
    overflow: "hidden",
  },
});
