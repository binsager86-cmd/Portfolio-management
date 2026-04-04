/**
 * KFH Trade Help Modal — instructions for saving KFH statements correctly.
 */

import { useThemeStore } from "@/services/themeStore";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import React from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

interface Props {
  visible: boolean;
  onClose: () => void;
}

export default function KfhTradeHelpModal({ visible, onClose }: Props) {
  const { colors } = useThemeStore();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose}>
        <Pressable style={[s.card, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]} onPress={(e) => e.stopPropagation()}>
          <View style={s.header}>
            <FontAwesome name="info-circle" size={20} color={colors.accentPrimary} />
            <Text style={[s.title, { color: colors.textPrimary }]}>
              How to save KFH statement correctly
            </Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <FontAwesome name="times" size={18} color={colors.textMuted} />
            </Pressable>
          </View>

          <ScrollView style={s.body}>
            <Text style={[s.note, { color: colors.warning }]}>
              English Version works better
            </Text>

            <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>
              If the system does not accept the file:
            </Text>

            <View style={s.steps}>
              {[
                "Open the KFH statement in Excel",
                'Click File → Save As',
                'Choose "Excel Workbook (*.xlsx)"',
                "Save the file and upload again",
              ].map((step, i) => (
                <View key={i} style={s.step}>
                  <View style={[s.stepNum, { backgroundColor: colors.accentPrimary + "20" }]}>
                    <Text style={[s.stepNumText, { color: colors.accentPrimary }]}>{i + 1}</Text>
                  </View>
                  <Text style={[s.stepText, { color: colors.textSecondary }]}>{step}</Text>
                </View>
              ))}
            </View>

            <View style={[s.tipBox, { backgroundColor: colors.accentPrimary + "10", borderColor: colors.accentPrimary + "30" }]}>
              <FontAwesome name="lightbulb-o" size={14} color={colors.accentPrimary} />
              <Text style={[s.tipText, { color: colors.textSecondary }]}>
                KFH Trade exports statements as HTML files with .xls extension. Re-saving as .xlsx ensures proper parsing.
              </Text>
            </View>
          </ScrollView>

          <Pressable
            onPress={onClose}
            style={[s.closeBtn, { backgroundColor: colors.accentPrimary }]}
          >
            <Text style={s.closeBtnText}>Got it</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  card: {
    maxWidth: 480,
    width: "100%",
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.1)",
  },
  title: { flex: 1, fontSize: 16, fontWeight: "700" },
  body: { padding: 16, maxHeight: 400 },
  note: { fontSize: 13, fontWeight: "600", marginBottom: 12 },
  sectionTitle: { fontSize: 14, fontWeight: "600", marginBottom: 12 },
  steps: { gap: 10, marginBottom: 16 },
  step: { flexDirection: "row", alignItems: "center", gap: 12 },
  stepNum: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  stepNumText: { fontSize: 13, fontWeight: "700" },
  stepText: { fontSize: 13, flex: 1 },
  tipBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  tipText: { fontSize: 12, flex: 1, lineHeight: 18 },
  closeBtn: {
    margin: 16,
    marginTop: 0,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  closeBtnText: { color: "#fff", fontSize: 14, fontWeight: "700" },
});
