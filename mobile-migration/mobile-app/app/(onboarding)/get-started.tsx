import { markOnboardingSeen } from "@/app/index";
import { useAuthStore } from "@/services/authStore";
import { useThemeStore } from "@/services/themeStore";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useRouter } from "expo-router";
import React, { useRef } from "react";
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

const CHECKLIST = [
  { icon: "user-plus" as const, label: "Create your account", done: false },
  { icon: "upload" as const, label: "Import your first transactions", done: false },
  { icon: "search" as const, label: "Look up a stock for analysis", done: false },
  { icon: "pie-chart" as const, label: "Explore your dashboard", done: false },
];

export default function GetStartedScreen() {
  const router = useRouter();
  const { colors } = useThemeStore();
  const token = useAuthStore((s) => s.token);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.9)).current;

  React.useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 60,
        friction: 8,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const handleGetStarted = async () => {
    await markOnboardingSeen();
    if (token) {
      router.replace("/(tabs)");
    } else {
      router.replace("/(auth)/login");
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.bgPrimary }]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Animated.View style={{ opacity: fadeAnim, transform: [{ scale: scaleAnim }] }}>
          {/* Rocket */}
          <View style={[styles.rocketCircle, { backgroundColor: colors.accentPrimary + "15" }]}>
            <FontAwesome name="rocket" size={48} color={colors.accentPrimary} />
          </View>

          <Text style={[styles.heading, { color: colors.textPrimary }]}>Quick Start Checklist</Text>
          <Text style={[styles.sub, { color: colors.textSecondary }]}>
            Here's what to do after you sign in — we'll guide you every step of the way.
          </Text>

          {/* Checklist */}
          {CHECKLIST.map((item, i) => (
            <View
              key={i}
              style={[styles.checkRow, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}
            >
              <View style={[styles.checkIcon, { backgroundColor: colors.textMuted + "20" }]}>
                <FontAwesome name={item.icon} size={16} color={colors.textMuted} />
              </View>
              <Text style={[styles.checkLabel, { color: colors.textPrimary }]}>{item.label}</Text>
              <FontAwesome name="circle-o" size={18} color={colors.borderColor} />
            </View>
          ))}
        </Animated.View>
      </ScrollView>

      {/* CTA Footer */}
      <View style={[styles.footer, { borderTopColor: colors.borderColor }]}>
        <Pressable onPress={handleGetStarted} style={[styles.button, { backgroundColor: colors.accentPrimary }]}>
          <FontAwesome name="rocket" size={16} color="#fff" style={{ marginRight: 8 }} />
          <Text style={styles.buttonText}>Let's Go!</Text>
        </Pressable>

        <Pressable
          onPress={() => router.replace("/(auth)/login")}
          style={[styles.outlineButton, { borderColor: colors.borderColor }]}
        >
          <FontAwesome name="upload" size={14} color={colors.accentPrimary} style={{ marginRight: 8 }} />
          <Text style={[styles.outlineText, { color: colors.accentPrimary }]}>Import Excel to Get Started</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: 24, paddingTop: 60, alignItems: "center" },
  rocketCircle: { width: 100, height: 100, borderRadius: 50, alignItems: "center", justifyContent: "center", marginBottom: 28, alignSelf: "center" },
  heading: { fontSize: 26, fontWeight: "800", textAlign: "center", marginBottom: 8 },
  sub: { fontSize: 15, textAlign: "center", lineHeight: 22, marginBottom: 28, paddingHorizontal: 10 },
  checkRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
    gap: 12,
    width: "100%",
  },
  checkIcon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  checkLabel: { flex: 1, fontSize: 14, fontWeight: "600" },
  footer: { padding: 24, borderTopWidth: 1, alignItems: "center", gap: 12 },
  button: { flexDirection: "row", alignItems: "center", paddingHorizontal: 32, paddingVertical: 16, borderRadius: 14, width: "100%", justifyContent: "center" },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  outlineButton: { flexDirection: "row", alignItems: "center", paddingVertical: 14, borderRadius: 14, borderWidth: 1, width: "100%", justifyContent: "center" },
  outlineText: { fontSize: 14, fontWeight: "600" },
});
