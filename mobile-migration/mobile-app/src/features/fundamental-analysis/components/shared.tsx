/**
 * Fundamental Analysis — Reusable micro-components.
 */

import FontAwesome from "@expo/vector-icons/FontAwesome";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Animated,
    Modal,
    Platform,
    Pressable,
    StyleProp,
    Text,
    TextInput,
    View,
    ViewStyle
} from "react-native";

import type { ThemePalette } from "@/constants/theme";
import { st } from "../styles";
import type { IconName } from "../types";
import { STMNT_META, STMNT_TYPES } from "../types";

/* ── Error Boundary ────────────────────────────────────────────── */

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<
  { colors: ThemePalette; children: React.ReactNode },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 20 }}>
          <FontAwesome name="exclamation-triangle" size={32} color={this.props.colors.danger} />
          <Text style={{ color: this.props.colors.textPrimary, fontSize: 16, fontWeight: "700", marginTop: 12 }}>
            Something went wrong
          </Text>
          <Text style={{ color: this.props.colors.textMuted, fontSize: 12, marginTop: 4, textAlign: "center" }}>
            {this.state.error?.message}
          </Text>
        </View>
      );
    }
    return this.props.children;
  }
}

/* ── Network Error State ─────────────────────────────────────── */

export function NetworkErrorState({
  error,
  onRetry,
  colors,
}: {
  error: Error | null;
  onRetry: () => void;
  colors: ThemePalette;
}) {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32 }}>
      <View style={[st.emptyIcon, { backgroundColor: colors.danger + "10" }]}>
        <FontAwesome name="wifi" size={32} color={colors.danger} />
      </View>
      <Text style={{ color: colors.textPrimary, fontSize: 16, fontWeight: "700", marginTop: 12 }}>
        Failed to load data
      </Text>
      <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 4, textAlign: "center", lineHeight: 18 }}>
        {error?.message ?? "A network error occurred. Please check your connection."}
      </Text>
      <Pressable
        onPress={onRetry}
        style={{
          marginTop: 16,
          paddingHorizontal: 20,
          paddingVertical: 10,
          backgroundColor: colors.accentPrimary,
          borderRadius: 8,
        }}
        accessibilityRole="button"
        accessibilityLabel="Retry loading data"
      >
        <Text style={{ color: "#fff", fontSize: 13, fontWeight: "700" }}>Retry</Text>
      </Pressable>
    </View>
  );
}

/* ── Chip ───────────────────────────────────────────────────────── */

export function Chip({
  label, active, onPress, colors, icon,
}: { label: string; active: boolean; onPress: () => void; colors: ThemePalette; icon?: IconName }) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        st.chip,
        {
          backgroundColor: active ? colors.accentPrimary : colors.bgCard,
          borderColor: active ? colors.accentPrimary : colors.borderColor,
        },
      ]}
    >
      {icon && <FontAwesome name={icon} size={11} color={active ? "#fff" : colors.textMuted} style={{ marginRight: 5 }} />}
      <Text style={{ color: active ? "#fff" : colors.textSecondary, fontSize: 12, fontWeight: "600" }}>
        {label}
      </Text>
    </Pressable>
  );
}

/* ── StatementTabBar ───────────────────────────────────────────── */

export function StatementTabBar({
  value, onChange, colors, showAll,
}: {
  value: string | undefined;
  onChange: (v: string | undefined) => void;
  colors: ThemePalette;
  showAll?: boolean;
}) {
  const tabs = useMemo(
    () => showAll
      ? [{ key: undefined as string | undefined, label: "All", icon: "th-list" as IconName, color: colors.accentPrimary }, ...STMNT_TYPES.map((t) => ({ key: t as string | undefined, ...STMNT_META[t] }))]
      : STMNT_TYPES.map((t) => ({ key: t as string | undefined, ...STMNT_META[t] })),
    [showAll, colors.accentPrimary],
  );

  return (
    <View style={{
      flexDirection: "row", backgroundColor: colors.bgPrimary,
      borderBottomWidth: 1, borderBottomColor: colors.borderColor,
      paddingHorizontal: 8, paddingTop: 4,
    }}>
      {tabs.map((t) => {
        const active = value === t.key;
        const tColor = active ? t.color : colors.textMuted;
        return (
          <Pressable
            key={t.key ?? "_all"}
            onPress={() => onChange(t.key)}
            style={({ pressed }) => ({
              flex: 1, alignItems: "center", paddingVertical: 10, paddingHorizontal: 4,
              borderBottomWidth: 2.5,
              borderBottomColor: active ? t.color : "transparent",
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <View style={{
              width: 30, height: 30, borderRadius: 15,
              backgroundColor: active ? t.color + "18" : "transparent",
              alignItems: "center", justifyContent: "center", marginBottom: 4,
            }}>
              <FontAwesome name={t.icon} size={14} color={tColor} />
            </View>
            <Text style={{
              fontSize: 10, fontWeight: active ? "800" : "600",
              color: tColor, textAlign: "center", letterSpacing: 0.2,
            }} numberOfLines={1}>
              {t.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/* ── ExportBar ─────────────────────────────────────────────────── */

export function ExportBar({
  onExport, colors, disabled,
}: { onExport: (fmt: "xlsx" | "csv" | "pdf") => Promise<void>; colors: ThemePalette; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<{ x: number; y: number; w: number } | null>(null);
  const triggerRef = useRef<View>(null);
  const off = disabled || busy != null;

  const handle = useCallback(async (fmt: "xlsx" | "csv" | "pdf") => {
    setOpen(false);
    setBusy(fmt);
    try { await onExport(fmt); }
    catch (e) { Alert.alert("Export Failed", e instanceof Error ? e.message : "Unknown error"); }
    setBusy(null);
  }, [onExport]);

  const openMenu = useCallback(() => {
    if (triggerRef.current) {
      triggerRef.current.measureInWindow((x, y, w, h) => {
        setMenuPos({ x: x + w, y: y + h + 4, w });
        setOpen(true);
      });
    } else {
      setOpen((p) => !p);
    }
  }, []);

  const items: { fmt: "xlsx" | "csv" | "pdf"; icon: IconName; label: string; color: string }[] = [
    { fmt: "xlsx", icon: "file-excel-o", label: "Excel (.xlsx)", color: colors.success },
    { fmt: "csv",  icon: "file-text-o",  label: "CSV (.csv)",    color: colors.accentPrimary },
    { fmt: "pdf",  icon: "file-pdf-o",   label: "PDF (.pdf)",    color: "#ef4444" },
  ];

  const dropdown = (
    <View style={[st.exportDropdown, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
      {items.map(({ fmt, icon, label, color }) => (
        <Pressable key={fmt} onPress={() => handle(fmt)} style={({ pressed }) => ([st.exportDropItem, pressed && { backgroundColor: color + "12" }])}>
          <FontAwesome name={icon} size={12} color={color} style={{ width: 18, textAlign: "center" }} />
          <Text style={{ fontSize: 12, color: colors.textPrimary, fontWeight: "600", marginLeft: 8 }}>{label}</Text>
        </Pressable>
      ))}
    </View>
  );

  return (
    <View ref={triggerRef} style={{ zIndex: 50 }}>
      <Pressable
        onPress={openMenu}
        disabled={off}
        style={({ pressed }) => ([
          st.exportTrigger,
          { borderColor: colors.borderColor, backgroundColor: pressed ? colors.accentPrimary + "12" : "transparent", opacity: off ? 0.4 : 1 },
        ])}
      >
        {busy ? (
          <ActivityIndicator size={11} color={colors.accentPrimary} />
        ) : (
          <>
            <FontAwesome name="download" size={11} color={colors.accentPrimary} />
            <Text style={{ fontSize: 10, fontWeight: "700", color: colors.accentPrimary, marginLeft: 4 }}>Export</Text>
            <FontAwesome name={open ? "chevron-up" : "chevron-down"} size={7} color={colors.textMuted} style={{ marginLeft: 3 }} />
          </>
        )}
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={{ flex: 1 }} onPress={() => setOpen(false)}>
          <View style={menuPos ? { position: "absolute", top: menuPos.y, right: Platform.OS === "web" ? undefined : 16, ...(Platform.OS === "web" ? { left: menuPos.x - 160 } : {}) } : { position: "absolute", top: 60, right: 16 }}>
            {dropdown}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

/* ── SectionHeader ─────────────────────────────────────────────── */

export function SectionHeader({
  title, icon, iconColor, badge, colors, style,
}: { title: string; icon?: IconName; iconColor?: string; badge?: number; colors: ThemePalette; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[st.sectionHeader, style]}>
      {icon && (
        <View style={[st.sectionIcon, { backgroundColor: (iconColor ?? colors.accentPrimary) + "18" }]}>
          <FontAwesome name={icon} size={12} color={iconColor ?? colors.accentPrimary} />
        </View>
      )}
      <Text style={[st.sectionTitle, { color: colors.textPrimary }]}>{title}</Text>
      {badge != null && badge > 0 && (
        <View style={[st.badge, { backgroundColor: colors.accentPrimary + "20" }]}>
          <Text style={{ color: colors.accentPrimary, fontSize: 11, fontWeight: "700" }}>{badge}</Text>
        </View>
      )}
    </View>
  );
}

/* ── Card ───────────────────────────────────────────────────────── */

export function Card({ colors, children, style, noPadding }: { colors: ThemePalette; children: React.ReactNode; style?: StyleProp<ViewStyle>; noPadding?: boolean }) {
  return (
    <View style={[
      st.card,
      { backgroundColor: colors.bgCard, borderColor: colors.borderColor, shadowColor: colors.cardShadowColor },
      noPadding && { paddingHorizontal: 0, paddingVertical: 0 },
      style,
    ]}>
      {children}
    </View>
  );
}

/* ── LabeledInput ──────────────────────────────────────────────── */

export function LabeledInput({
  label, value, onChangeText, colors, keyboardType, placeholder, autoCapitalize, flex, helperText,
}: {
  label: string; value: string; onChangeText: (v: string) => void; colors: ThemePalette;
  keyboardType?: "numeric" | "default"; placeholder?: string; autoCapitalize?: "characters" | "none"; flex?: number;
  helperText?: string;
}) {
  const [showHelper, setShowHelper] = useState(false);
  return (
    <View style={[{ flex: flex ?? undefined, marginBottom: 10 }]}>
      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 4 }}>
        <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "600", letterSpacing: 0.5 }}>
          {label}
        </Text>
        {helperText ? (
          <Pressable
            onPress={() => setShowHelper(v => !v)}
            hitSlop={8}
            style={{ marginLeft: 5 }}
          >
            <FontAwesome name="question-circle" size={13} color={showHelper ? colors.accentPrimary : colors.textMuted + "99"} />
          </Pressable>
        ) : null}
      </View>
      {showHelper && helperText ? (
        <View style={{
          backgroundColor: colors.accentPrimary + "14",
          borderLeftWidth: 3,
          borderLeftColor: colors.accentPrimary,
          borderRadius: 6,
          paddingHorizontal: 10,
          paddingVertical: 7,
          marginBottom: 6,
        }}>
          <Text style={{ color: colors.textSecondary, fontSize: 11, lineHeight: 16 }}>
            {helperText}
          </Text>
        </View>
      ) : null}
      <TextInput
        placeholder={placeholder ?? label}
        placeholderTextColor={colors.textMuted + "80"}
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        style={[st.input, { color: colors.textPrimary, borderColor: colors.borderColor, backgroundColor: colors.bgInput }]}
      />
    </View>
  );
}

/* ── ActionButton ──────────────────────────────────────────────── */

export function ActionButton({
  label, onPress, colors, variant = "primary", disabled, loading, icon, flex,
}: {
  label: string; onPress: () => void; colors: ThemePalette;
  variant?: "primary" | "success" | "secondary" | "danger"; disabled?: boolean; loading?: boolean;
  icon?: IconName; flex?: number;
}) {
  const bgMap = { primary: colors.accentPrimary, success: colors.success, secondary: colors.bgCard, danger: colors.danger };
  const textMap = { primary: "#fff", success: "#fff", secondary: colors.textPrimary, danger: "#fff" };
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={[st.actionBtn, {
        backgroundColor: bgMap[variant], opacity: disabled ? 0.5 : 1,
        borderWidth: variant === "secondary" ? 1 : 0, borderColor: colors.borderColor, flex: flex,
      }]}
    >
      {loading ? (
        <Text style={[st.actionBtnText, { color: textMap[variant] }]}>...</Text>
      ) : (
        <>
          {icon && <FontAwesome name={icon} size={13} color={textMap[variant]} style={{ marginRight: 6 }} />}
          <Text style={[st.actionBtnText, { color: textMap[variant] }]}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

/* ── FadeIn ─────────────────────────────────────────────────────── */

export function FadeIn({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(8)).current;
  useEffect(() => {
    const anim = Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 350, delay, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 350, delay, useNativeDriver: true }),
    ]);
    anim.start();
    return () => anim.stop();
  }, []);
  return (
    <Animated.View style={{ opacity, transform: [{ translateY }] }}>
      {children}
    </Animated.View>
  );
}
