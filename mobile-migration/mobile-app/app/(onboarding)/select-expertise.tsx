import { markOnboardingSeen } from "@/app/index";
import { useAuthStore } from "@/services/authStore";
import { useThemeStore } from "@/services/themeStore";
import { useWebMeta } from "@/hooks/useWebMeta";
import {
    EXPERTISE_LEVELS,
    ExpertiseLevel,
    useUserPrefsStore,
} from "@/src/store/userPrefsStore";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useRouter } from "expo-router";
import React, { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
    Animated,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";

export default function SelectExpertiseScreen() {
  const router = useRouter();
  const { colors } = useThemeStore();
  const token = useAuthStore((s) => s.token);
  const { t } = useTranslation();
  const setExpertiseLevel = useUserPrefsStore((s) => s.setExpertiseLevel);
  const currentLevel = useUserPrefsStore((s) => s.preferences.expertiseLevel);

  const [selected, setSelected] = useState<ExpertiseLevel>(currentLevel);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useWebMeta(
    "Choose Experience Level — Portfolio Tracker",
    "Select your investing experience level to customize your Portfolio Tracker dashboard.",
  );

  React.useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();
  }, []);

  const handleContinue = async () => {
    setExpertiseLevel(selected);
    await markOnboardingSeen();
    if (token) {
      router.replace("/(tabs)");
    } else {
      router.replace("/(auth)/login");
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.bgPrimary }]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
          {/* Header */}
          <View
            style={[
              styles.iconCircle,
              { backgroundColor: colors.accentPrimary + "15" },
            ]}
          >
            <FontAwesome
              name="sliders"
              size={48}
              color={colors.accentPrimary}
            />
          </View>
          <Text
            style={[styles.title, { color: colors.textPrimary }]}
            accessibilityRole="header"
          >
            {t('onboarding.chooseExperience')}
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            {t('onboarding.expertiseSubtitle')}
          </Text>

          {/* Level Cards */}
          {EXPERTISE_LEVELS.map((level) => {
            const isSelected = selected === level.key;
            return (
              <Pressable
                key={level.key}
                onPress={() => setSelected(level.key)}
                style={[
                  styles.card,
                  {
                    backgroundColor: isSelected
                      ? colors.accentPrimary + "12"
                      : colors.bgCard,
                    borderColor: isSelected
                      ? colors.accentPrimary
                      : colors.borderColor,
                    borderWidth: isSelected ? 2 : 1,
                  },
                ]}
              >
                {/* Card Header */}
                <View style={styles.cardHeader}>
                  <View
                    style={[
                      styles.cardIcon,
                      {
                        backgroundColor: isSelected
                          ? colors.accentPrimary + "20"
                          : colors.bgPrimary,
                      },
                    ]}
                  >
                    <FontAwesome
                      name={level.icon as any}
                      size={20}
                      color={
                        isSelected
                          ? colors.accentPrimary
                          : colors.textSecondary
                      }
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[
                        styles.cardTitle,
                        {
                          color: isSelected
                            ? colors.accentPrimary
                            : colors.textPrimary,
                        },
                      ]}
                    >
                      {t(`onboarding.${level.key}Label`)}
                    </Text>
                    <Text
                      style={[
                        styles.cardDesc,
                        { color: colors.textSecondary },
                      ]}
                    >
                      {t(`onboarding.${level.key}Desc`)}
                    </Text>
                  </View>
                  {/* Radio indicator */}
                  <View
                    style={[
                      styles.radio,
                      {
                        borderColor: isSelected
                          ? colors.accentPrimary
                          : colors.textMuted,
                      },
                    ]}
                  >
                    {isSelected && (
                      <View
                        style={[
                          styles.radioDot,
                          { backgroundColor: colors.accentPrimary },
                        ]}
                      />
                    )}
                  </View>
                </View>

                {/* Expanded details when selected */}
                {isSelected && (
                  <View style={styles.details}>
                    <Text
                      style={[
                        styles.detailHeader,
                        { color: colors.textPrimary },
                      ]}
                    >
                      {t('onboarding.youAre')}
                    </Text>
                    {level.youAre.map((item, i) => (
                      <View key={i} style={styles.detailRow}>
                        <FontAwesome
                          name="check"
                          size={12}
                          color={colors.success}
                        />
                        <Text
                          style={[
                            styles.detailText,
                            { color: colors.textSecondary },
                          ]}
                        >
                          {t(`onboarding.${level.key}Who${i + 1}`)}
                        </Text>
                      </View>
                    ))}
                    <Text
                      style={[
                        styles.detailHeader,
                        { color: colors.textPrimary, marginTop: 10 },
                      ]}
                    >
                      {t('onboarding.youGet')}
                    </Text>
                    {level.youGet.map((item, i) => (
                      <View key={i} style={styles.detailRow}>
                        <FontAwesome
                          name="star"
                          size={12}
                          color={colors.accentPrimary}
                        />
                        <Text
                          style={[
                            styles.detailText,
                            { color: colors.textSecondary },
                          ]}
                        >
                          {t(`onboarding.${level.key}Get${i + 1}`)}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
              </Pressable>
            );
          })}

          {/* Continue Button */}
          <Pressable
            onPress={handleContinue}
            style={[styles.button, { backgroundColor: colors.accentPrimary }]}
          >
            <Text style={styles.buttonText}>{t('onboarding.continue')}</Text>
            <FontAwesome
              name="arrow-right"
              size={16}
              color="#fff"
              style={{ marginLeft: 8 }}
            />
          </Pressable>

          {/* Skip */}
          <Pressable
            onPress={async () => {
              await markOnboardingSeen();
              router.replace(token ? "/(tabs)" : "/(auth)/login");
            }}
            style={styles.skip}
          >
            <Text style={[styles.skipText, { color: colors.textMuted }]}>
              {t('onboarding.skipForNow')}
            </Text>
          </Pressable>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: "center", padding: 24 },
  content: { alignItems: "center" },
  iconCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
  },
  title: {
    fontSize: 26,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 8,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 15,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 28,
    paddingHorizontal: 10,
  },
  card: {
    width: "100%",
    maxWidth: 440,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  cardIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: "700",
    marginBottom: 2,
  },
  cardDesc: {
    fontSize: 13,
    lineHeight: 18,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  radioDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  details: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: "rgba(128,128,128,0.15)",
  },
  detailHeader: {
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 6,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
    paddingLeft: 4,
  },
  detailText: {
    fontSize: 13,
    lineHeight: 18,
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 14,
    minWidth: 200,
    justifyContent: "center",
    marginTop: 16,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  skip: {
    marginTop: 16,
    paddingVertical: 12,
  },
  skipText: {
    fontSize: 14,
    fontWeight: "500",
  },
});
