import { markOnboardingSeen } from "@/app/index";
import { useThemeStore } from "@/services/themeStore";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useRouter } from "expo-router";
import React, { useRef } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";

export default function WelcomeScreen() {
  const router = useRouter();
  const { colors } = useThemeStore();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;

  React.useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.spring(slideAnim, {
        toValue: 0,
        tension: 50,
        friction: 8,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: colors.bgPrimary }]}>
      <Animated.View
        style={[
          styles.content,
          { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
        ]}
      >
        {/* Hero Illustration */}
        <View style={[styles.illustration, { backgroundColor: colors.accentPrimary + "15" }]}>
          <FontAwesome name="pie-chart" size={80} color={colors.accentPrimary} />
        </View>

        {/* Title */}
        <Text style={[styles.title, { color: colors.textPrimary }]}>
          Track Your Portfolio Like a Pro
        </Text>

        {/* Description */}
        <Text style={[styles.description, { color: colors.textSecondary }]}>
          Import transactions, analyze fundamentals, and get AI-powered insights — all in one place.
        </Text>

        {/* Feature Pills */}
        <View style={styles.featurePills}>
          <View style={[styles.pill, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
            <FontAwesome name="upload" size={14} color={colors.success} />
            <Text style={[styles.pillText, { color: colors.textSecondary }]}>Import Excel</Text>
          </View>
          <View style={[styles.pill, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
            <FontAwesome name="flask" size={14} color={colors.accentPrimary} />
            <Text style={[styles.pillText, { color: colors.textSecondary }]}>AI Analysis</Text>
          </View>
          <View style={[styles.pill, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
            <FontAwesome name="line-chart" size={14} color={colors.accentSecondary} />
            <Text style={[styles.pillText, { color: colors.textSecondary }]}>Valuations</Text>
          </View>
        </View>

        {/* Next Button */}
        <Pressable
          onPress={() => router.push("/(onboarding)/features")}
          style={[styles.button, { backgroundColor: colors.accentPrimary }]}
        >
          <Text style={styles.buttonText}>Next</Text>
          <FontAwesome name="arrow-right" size={16} color="#fff" style={{ marginLeft: 8 }} />
        </Pressable>

        {/* Skip Link */}
        <Pressable onPress={() => { markOnboardingSeen(); router.replace("/(auth)/login"); }} style={styles.skip}>
          <Text style={[styles.skipText, { color: colors.textMuted }]}>Skip for now</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, padding: 32, justifyContent: "center", alignItems: "center" },
  illustration: { width: 160, height: 160, borderRadius: 80, alignItems: "center", justifyContent: "center", marginBottom: 40 },
  title: { fontSize: 28, fontWeight: "800", textAlign: "center", marginBottom: 16, letterSpacing: -0.5 },
  description: { fontSize: 16, textAlign: "center", lineHeight: 24, marginBottom: 32, paddingHorizontal: 20 },
  featurePills: { flexDirection: "row", gap: 10, marginBottom: 40, flexWrap: "wrap", justifyContent: "center" },
  pill: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  pillText: { fontSize: 13, fontWeight: "600" },
  button: { flexDirection: "row", alignItems: "center", paddingHorizontal: 32, paddingVertical: 16, borderRadius: 14, minWidth: 200, justifyContent: "center" },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  skip: { marginTop: 20, paddingVertical: 12 },
  skipText: { fontSize: 14, fontWeight: "500" },
});
