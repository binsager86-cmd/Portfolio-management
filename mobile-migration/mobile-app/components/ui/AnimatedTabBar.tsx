/**
 * AnimatedTabBar — custom bottom tab bar with professional motion design.
 *
 * Features:
 *  • Icon scale bounce on press (spring physics)
 *  • Smooth active indicator pill that slides between tabs
 *  • Subtle opacity transitions on label
 *  • Haptic-feel press-down scale effect
 */

import FontAwesome from "@expo/vector-icons/FontAwesome";
import type { ThemePalette } from "@/constants/theme";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import React, { useCallback, useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
    interpolate,
    useAnimatedStyle,
    useSharedValue,
    withSpring,
} from "react-native-reanimated";

const SPRING_CONFIG = { damping: 15, stiffness: 180, mass: 0.8 };

interface AnimatedTabItemProps {
  label: string;
  iconName: React.ComponentProps<typeof FontAwesome>["name"];
  isFocused: boolean;
  onPress: () => void;
  onLongPress: () => void;
  activeTint: string;
  inactiveTint: string;
  accessibilityLabel?: string;
}

function AnimatedTabItem({
  label,
  iconName,
  isFocused,
  onPress,
  onLongPress,
  activeTint,
  inactiveTint,
  accessibilityLabel,
}: AnimatedTabItemProps) {
  const scale = useSharedValue(1);
  const focusAnim = useSharedValue(isFocused ? 1 : 0);

  useEffect(() => {
    focusAnim.value = withSpring(isFocused ? 1 : 0, SPRING_CONFIG);
  }, [isFocused]);

  const handlePressIn = useCallback(() => {
    scale.value = withSpring(0.85, { damping: 12, stiffness: 300 });
  }, []);

  const handlePressOut = useCallback(() => {
    scale.value = withSpring(1, SPRING_CONFIG);
  }, []);

  const containerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const iconContainerStyle = useAnimatedStyle(() => {
    const iconScale = interpolate(focusAnim.value, [0, 1], [1, 1.15]);
    const translateY = interpolate(focusAnim.value, [0, 1], [0, -2]);
    return {
      transform: [{ scale: iconScale }, { translateY }],
    };
  });

  const pillStyle = useAnimatedStyle(() => {
    const opacity = interpolate(focusAnim.value, [0, 1], [0, 1]);
    const scaleX = interpolate(focusAnim.value, [0, 1], [0.5, 1]);
    return {
      opacity,
      transform: [{ scaleX }],
    };
  });

  const labelStyle = useAnimatedStyle(() => {
    const opacity = interpolate(focusAnim.value, [0, 1], [0.7, 1]);
    return { opacity };
  });

  const color = isFocused ? activeTint : inactiveTint;

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      accessibilityRole="tab"
      accessibilityState={{ selected: isFocused }}
      accessibilityLabel={accessibilityLabel}
      style={styles.tabItem}
    >
      <Animated.View style={containerStyle}>
        {/* Active indicator pill */}
        <Animated.View
          style={[
            styles.activePill,
            { backgroundColor: activeTint + "20" },
            pillStyle,
          ]}
        />
        <Animated.View style={iconContainerStyle}>
          <FontAwesome name={iconName} size={22} color={color} />
        </Animated.View>
        <Animated.View style={labelStyle}>
          <Text
            style={[
              styles.label,
              { color, fontWeight: isFocused ? "700" : "600" },
            ]}
            numberOfLines={1}
          >
            {label}
          </Text>
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

// ── Icon name mapping from screen route names ──────────────────────

const ICON_MAP: Record<string, React.ComponentProps<typeof FontAwesome>["name"]> = {
  index: "line-chart",
  news: "newspaper-o",
  market: "globe",
  "portfolio-analysis": "briefcase",
  transactions: "exchange",
  deposits: "bank",
  trading: "bar-chart-o",
  "fundamental-analysis": "flask",
  "portfolio-tracker": "camera",
  dividends: "money",
  alerts: "bell",
  planner: "calculator",
  pfm: "pie-chart",
  integrity: "stethoscope",
  backup: "cloud-download",
  settings: "cog",
  admin: "shield",
};

// ── Main component ─────────────────────────────────────────────────

export function AnimatedTabBar({
  state,
  descriptors,
  navigation,
  colors,
  insetBottom,
}: BottomTabBarProps & { colors: ThemePalette; insetBottom: number }) {
  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.tabBarBg,
          borderTopColor: colors.tabBarBorder,
          paddingBottom: insetBottom,
          height: 60 + insetBottom,
        },
      ]}
    >
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key];
        // Skip hidden tabs
        if ((options as { href?: string | null }).href === null) return null;

        const label =
          typeof options.tabBarLabel === "string"
            ? options.tabBarLabel
            : typeof options.title === "string"
            ? options.title
            : route.name;

        const isFocused = state.index === index;
        const iconName = ICON_MAP[route.name] ?? "circle";

        const onPress = () => {
          const event = navigation.emit({
            type: "tabPress",
            target: route.key,
            canPreventDefault: true,
          });
          if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(route.name, route.params);
          }
        };

        const onLongPress = () => {
          navigation.emit({ type: "tabLongPress", target: route.key });
        };

        return (
          <AnimatedTabItem
            key={route.key}
            label={label}
            iconName={iconName}
            isFocused={isFocused}
            onPress={onPress}
            onLongPress={onLongPress}
            activeTint={colors.accentPrimary}
            inactiveTint={colors.textMuted}
            accessibilityLabel={options.tabBarAccessibilityLabel}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    borderTopWidth: 1,
    alignItems: "center",
  },
  tabItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 6,
  },
  activePill: {
    position: "absolute",
    top: -4,
    left: -12,
    right: -12,
    bottom: -4,
    borderRadius: 16,
  },
  label: {
    fontSize: 12,
    marginTop: 2,
    letterSpacing: 0.2,
  },
});
