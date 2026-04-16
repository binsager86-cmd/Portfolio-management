import React, { useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { ProgressBar } from "react-native-paper";

import { UITokens } from "@/constants/uiTokens";
import { useThemeStore } from "@/services/themeStore";
import { PressableCard } from "../ui/PressableCard";

export interface WizardStep {
  label: string;
  component: React.ReactNode;
  /** Return true if step is valid, false to block advancement. */
  validate?: () => boolean;
}

export const StepWizard: React.FC<{
  steps: WizardStep[];
  onComplete: () => void;
  accentColor?: string;
}> = ({ steps, onComplete, accentColor = "#3b82f6" }) => {
  const { colors } = useThemeStore();
  const [current, setCurrent] = useState(0);

  const triggerHaptic = (style: "light" | "success") => {
    if (Platform.OS === "web") return;
    import("expo-haptics").then((h) => {
      if (style === "success") {
        h.notificationAsync(h.NotificationFeedbackType.Success);
      } else {
        h.impactAsync(h.ImpactFeedbackStyle.Light);
      }
    });
  };

  const handleNext = () => {
    if (steps[current].validate && !steps[current].validate!()) {
      triggerHaptic("light");
      return;
    }
    triggerHaptic("success");
    if (current < steps.length - 1) {
      setCurrent((c) => c + 1);
    } else {
      onComplete();
    }
  };

  const handleBack = () => {
    if (current > 0) setCurrent((c) => c - 1);
  };

  const progress = (current + 1) / steps.length;
  const isLast = current === steps.length - 1;

  return (
    <View style={styles.container}>
      <ProgressBar
        progress={progress}
        color={accentColor}
        style={styles.bar}
      />
      <Text style={[styles.stepLabel, { color: colors.textMuted }]}>
        Step {current + 1} of {steps.length}
      </Text>
      <Text style={[styles.title, { color: colors.textPrimary }]}>
        {steps[current].label}
      </Text>

      <PressableCard style={styles.stepContainer}>
        {steps[current].component}
      </PressableCard>

      <View style={styles.buttons}>
        {current > 0 && (
          <Pressable
            onPress={handleBack}
            style={[styles.btn, styles.btnSecondary, { borderColor: colors.borderColor }]}
          >
            <Text style={[styles.btnText, { color: colors.textPrimary }]}>
              Back
            </Text>
          </Pressable>
        )}
        <Pressable
          onPress={handleNext}
          style={[styles.btn, styles.btnPrimary, { backgroundColor: accentColor }]}
        >
          <Text style={[styles.btnText, { color: "#fff" }]}>
            {isLast ? "Submit" : "Next"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, padding: UITokens.spacing.md },
  bar: { height: 4, borderRadius: 2, marginBottom: UITokens.spacing.sm },
  stepLabel: {
    fontSize: UITokens.typography.caption.size,
    marginBottom: UITokens.spacing.xs,
  },
  title: {
    fontSize: UITokens.typography.title.size,
    fontWeight: UITokens.typography.title.weight,
    marginBottom: UITokens.spacing.lg,
  },
  stepContainer: { flex: 1 },
  buttons: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: UITokens.spacing.sm,
    marginTop: UITokens.spacing.md,
  },
  btn: {
    paddingHorizontal: UITokens.spacing.lg,
    paddingVertical: UITokens.spacing.sm + 4,
    borderRadius: UITokens.radius.md,
    minHeight: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  btnPrimary: {},
  btnSecondary: { borderWidth: 1 },
  btnText: { fontSize: UITokens.typography.body.size, fontWeight: "600" },
});
