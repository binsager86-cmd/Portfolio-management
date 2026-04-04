import { markOnboardingSeen } from "@/app/index";
import { useThemeStore } from "@/services/themeStore";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useRouter } from "expo-router";
import React, { useRef } from "react";
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

const FEATURES = [
  {
    icon: "upload" as const,
    color: "#34D399",
    title: "Import Transactions",
    desc: "Upload an Excel file or add transactions manually to build your portfolio.",
  },
  {
    icon: "flask" as const,
    color: "#818CF8",
    title: "AI Fundamental Analysis",
    desc: "Get detailed growth, valuation, and financial health reports powered by AI.",
  },
  {
    icon: "balance-scale" as const,
    color: "#F59E0B",
    title: "Valuations & DCF",
    desc: "See fair-value estimates, margin of safety, and discounted cash flow models.",
  },
  {
    icon: "line-chart" as const,
    color: "#38BDF8",
    title: "Track & Monitor",
    desc: "Real-time prices, dividends, allocation charts, and performance metrics.",
  },
];

export default function FeaturesScreen() {
  const router = useRouter();
  const { colors } = useThemeStore();
  const fadeAnims = useRef(FEATURES.map(() => new Animated.Value(0))).current;
  const slideAnims = useRef(FEATURES.map(() => new Animated.Value(40))).current;

  React.useEffect(() => {
    const animations = FEATURES.map((_, i) =>
      Animated.parallel([
        Animated.timing(fadeAnims[i], {
          toValue: 1,
          duration: 500,
          delay: i * 150,
          useNativeDriver: true,
        }),
        Animated.spring(slideAnims[i], {
          toValue: 0,
          tension: 50,
          friction: 8,
          delay: i * 150,
          useNativeDriver: true,
        }),
      ])
    );
    Animated.stagger(100, animations).start();
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: colors.bgPrimary }]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Section Header */}
        <Text style={[styles.heading, { color: colors.textPrimary }]}>What You Can Do</Text>
        <Text style={[styles.sub, { color: colors.textSecondary }]}>
          Everything you need to manage and analyze your investment portfolio.
        </Text>

        {/* Feature Cards */}
        {FEATURES.map((f, i) => (
          <Animated.View
            key={f.title}
            style={[
              styles.card,
              {
                backgroundColor: colors.bgCard,
                borderColor: colors.borderColor,
                opacity: fadeAnims[i],
                transform: [{ translateY: slideAnims[i] }],
              },
            ]}
          >
            <View style={[styles.iconCircle, { backgroundColor: f.color + "20" }]}>
              <FontAwesome name={f.icon} size={24} color={f.color} />
            </View>
            <View style={styles.cardText}>
              <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>{f.title}</Text>
              <Text style={[styles.cardDesc, { color: colors.textSecondary }]}>{f.desc}</Text>
            </View>
          </Animated.View>
        ))}
      </ScrollView>

      {/* Footer Buttons */}
      <View style={[styles.footer, { borderTopColor: colors.borderColor }]}>
        <Pressable
          onPress={() => router.push("/(onboarding)/get-started")}
          style={[styles.button, { backgroundColor: colors.accentPrimary }]}
        >
          <Text style={styles.buttonText}>Continue</Text>
          <FontAwesome name="arrow-right" size={16} color="#fff" style={{ marginLeft: 8 }} />
        </Pressable>
        <Pressable onPress={() => { markOnboardingSeen(); router.replace("/(auth)/login"); }} style={styles.skip}>
          <Text style={[styles.skipText, { color: colors.textMuted }]}>Skip</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: 24, paddingTop: 60, paddingBottom: 20 },
  heading: { fontSize: 26, fontWeight: "800", marginBottom: 8, letterSpacing: -0.3 },
  sub: { fontSize: 15, lineHeight: 22, marginBottom: 28 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 14,
    gap: 14,
  },
  iconCircle: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center" },
  cardText: { flex: 1 },
  cardTitle: { fontSize: 16, fontWeight: "700", marginBottom: 4 },
  cardDesc: { fontSize: 13, lineHeight: 19 },
  footer: { padding: 24, borderTopWidth: 1, alignItems: "center" },
  button: { flexDirection: "row", alignItems: "center", paddingHorizontal: 32, paddingVertical: 16, borderRadius: 14, width: "100%", justifyContent: "center" },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  skip: { marginTop: 14, paddingVertical: 8 },
  skipText: { fontSize: 14, fontWeight: "500" },
});
