/**
 * DateInput — cross-platform date input with native date pickers.
 * Web: uses native HTML <input type="date"> for reliable calendar popup.
 * Native: shows a modal date picker.
 */

import React, { useRef, useState } from "react";
import { View, Pressable, StyleSheet, Platform, Text, Modal, TouchableOpacity } from "react-native";
import { TextInput } from "./TextInput";
import { FontAwesome } from "@expo/vector-icons";
import { useThemeStore } from "@/services/themeStore";

interface DateInputProps {
  value: string;
  onChangeText: (text: string) => void;
  hasError?: boolean;
}

/* ── Web date picker (HTML <input type="date">) ── */
function WebDateInput({ value, onChangeText, hasError }: DateInputProps) {
  const { colors } = useThemeStore();
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <View style={styles.row}>
      <Pressable
        style={[
          styles.webDateBox,
          {
            backgroundColor: colors.bgInput,
            borderColor: hasError ? colors.danger : colors.borderColor,
          },
        ]}
        onPress={() => {
          // Open the native date picker (showPicker is supported in modern browsers)
          try {
            inputRef.current?.showPicker?.();
          } catch {
            inputRef.current?.click();
          }
        }}
      >
        <FontAwesome name="calendar" size={16} color={colors.accentPrimary} style={{ marginRight: 10 }} />
        <Text style={{ color: value ? colors.textPrimary : colors.textMuted, fontSize: 15, flex: 1 }}>
          {value || "Select date..."}
        </Text>
        <FontAwesome name="caret-down" size={14} color={colors.textSecondary} />
      </Pressable>

      {/* Hidden native HTML date input */}
      <input
        ref={inputRef}
        type="date"
        value={value}
        aria-label="Select date"
        title="Select date"
        onChange={(e) => onChangeText(e.target.value)}
        style={{
          position: "absolute",
          opacity: 0,
          width: 1,
          height: 1,
          pointerEvents: "none",
        }}
      />
    </View>
  );
}

/* ── Native date picker (modal with scroll wheels) ── */
function NativeDateInput({ value, onChangeText, hasError }: DateInputProps) {
  const { colors } = useThemeStore();
  const [showPicker, setShowPicker] = useState(false);
  const [tempDate, setTempDate] = useState(() => value ? new Date(value) : new Date());

  // Date part helpers
  const [selYear, setSelYear] = useState(() => (value ? new Date(value) : new Date()).getFullYear());
  const [selMonth, setSelMonth] = useState(() => (value ? new Date(value) : new Date()).getMonth());
  const [selDay, setSelDay] = useState(() => (value ? new Date(value) : new Date()).getDate());

  const handleChange = (text: string) => {
    const cleaned = text.replace(/[^0-9\-]/g, "");
    onChangeText(cleaned);
  };

  const openPicker = () => {
    const d = value ? new Date(value) : new Date();
    setSelYear(d.getFullYear());
    setSelMonth(d.getMonth());
    setSelDay(d.getDate());
    setShowPicker(true);
  };

  const confirmDate = () => {
    const formatted = `${selYear}-${String(selMonth + 1).padStart(2, "0")}-${String(selDay).padStart(2, "0")}`;
    onChangeText(formatted);
    setShowPicker(false);
  };

  const daysInMonth = new Date(selYear, selMonth + 1, 0).getDate();

  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <TextInput
          value={value}
          onChangeText={handleChange}
          placeholder="YYYY-MM-DD"
          keyboardType="numbers-and-punctuation"
          hasError={hasError}
          maxLength={10}
        />
      </View>
      <Pressable
        style={[
          styles.iconBox,
          { backgroundColor: colors.bgInput, borderColor: colors.borderColor },
        ]}
        onPress={openPicker}
      >
        <FontAwesome name="calendar" size={18} color={colors.accentPrimary} />
      </Pressable>

      {/* Simple date selection modal */}
      <Modal visible={showPicker} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Select Date</Text>

            {/* Year / Month / Day selectors */}
            <View style={styles.dateRow}>
              {/* Year */}
              <View style={styles.dateCol}>
                <Text style={[styles.dateLabel, { color: colors.textSecondary }]}>Year</Text>
                <View style={styles.spinnerRow}>
                  <TouchableOpacity onPress={() => setSelYear((y) => y - 1)}>
                    <FontAwesome name="minus-circle" size={22} color={colors.accentPrimary} />
                  </TouchableOpacity>
                  <Text style={[styles.spinnerValue, { color: colors.textPrimary }]}>{selYear}</Text>
                  <TouchableOpacity onPress={() => setSelYear((y) => y + 1)}>
                    <FontAwesome name="plus-circle" size={22} color={colors.accentPrimary} />
                  </TouchableOpacity>
                </View>
              </View>
              {/* Month */}
              <View style={styles.dateCol}>
                <Text style={[styles.dateLabel, { color: colors.textSecondary }]}>Month</Text>
                <View style={styles.spinnerRow}>
                  <TouchableOpacity onPress={() => setSelMonth((m) => (m <= 0 ? 11 : m - 1))}>
                    <FontAwesome name="minus-circle" size={22} color={colors.accentPrimary} />
                  </TouchableOpacity>
                  <Text style={[styles.spinnerValue, { color: colors.textPrimary }]}>{String(selMonth + 1).padStart(2, "0")}</Text>
                  <TouchableOpacity onPress={() => setSelMonth((m) => (m >= 11 ? 0 : m + 1))}>
                    <FontAwesome name="plus-circle" size={22} color={colors.accentPrimary} />
                  </TouchableOpacity>
                </View>
              </View>
              {/* Day */}
              <View style={styles.dateCol}>
                <Text style={[styles.dateLabel, { color: colors.textSecondary }]}>Day</Text>
                <View style={styles.spinnerRow}>
                  <TouchableOpacity onPress={() => setSelDay((d) => (d <= 1 ? daysInMonth : d - 1))}>
                    <FontAwesome name="minus-circle" size={22} color={colors.accentPrimary} />
                  </TouchableOpacity>
                  <Text style={[styles.spinnerValue, { color: colors.textPrimary }]}>{String(selDay).padStart(2, "0")}</Text>
                  <TouchableOpacity onPress={() => setSelDay((d) => (d >= daysInMonth ? 1 : d + 1))}>
                    <FontAwesome name="plus-circle" size={22} color={colors.accentPrimary} />
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            {/* Preview */}
            <Text style={[styles.datePreview, { color: colors.accentPrimary }]}>
              {selYear}-{String(selMonth + 1).padStart(2, "0")}-{String(selDay).padStart(2, "0")}
            </Text>

            {/* Buttons */}
            <View style={styles.modalButtons}>
              <TouchableOpacity
                onPress={() => { const t = new Date(); setSelYear(t.getFullYear()); setSelMonth(t.getMonth()); setSelDay(t.getDate()); }}
                style={[styles.modalBtn, { borderColor: colors.borderColor }]}
              >
                <Text style={{ color: colors.accentPrimary, fontWeight: "600" }}>Today</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setShowPicker(false)} style={[styles.modalBtn, { borderColor: colors.borderColor }]}>
                <Text style={{ color: colors.textSecondary, fontWeight: "600" }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={confirmDate} style={[styles.modalBtnPrimary, { backgroundColor: colors.accentPrimary }]}>
                <Text style={{ color: "#fff", fontWeight: "700" }}>Confirm</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

/* ── Platform switch ── */
export function DateInput(props: DateInputProps) {
  if (Platform.OS === "web") return <WebDateInput {...props} />;
  return <NativeDateInput {...props} />;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: 8,
  },
  webDateBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 48,
  },
  iconBox: {
    borderWidth: 1,
    borderRadius: 10,
    width: 48,
    justifyContent: "center",
    alignItems: "center",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalContent: {
    width: "100%",
    maxWidth: 380,
    borderRadius: 16,
    borderWidth: 1,
    padding: 24,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 20,
  },
  dateRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: 16,
  },
  dateCol: {
    alignItems: "center",
    gap: 8,
  },
  dateLabel: {
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  spinnerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  spinnerValue: {
    fontSize: 20,
    fontWeight: "700",
    minWidth: 40,
    textAlign: "center",
  },
  datePreview: {
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
    marginBottom: 20,
  },
  modalButtons: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
  },
  modalBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  modalBtnPrimary: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
});
