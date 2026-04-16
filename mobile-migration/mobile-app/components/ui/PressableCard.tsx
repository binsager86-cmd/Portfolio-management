import React from "react";
import { Platform, Pressable, StyleSheet, type ViewStyle } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

import { UITokens } from "@/constants/uiTokens";
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
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    if (disabled) return;
    scale.value = withSpring(0.97, { damping: 15, stiffness: 300 });
    if (Platform.OS !== "web") {
      import("expo-haptics").then((h) =>
        h.impactAsync(h.ImpactFeedbackStyle.Light),
      );
    }
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 15, stiffness: 300 });
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
      style={[
        styles.base,
        UITokens.shadows.card,
        { backgroundColor: colors.bgCard },
        animatedStyle,
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
