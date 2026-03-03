/**
 * Login Screen — React Native Paper, responsive for Web + Mobile.
 *
 * Uses themed Paper components with large touch targets for web mouse
 * users and mobile tap ergonomics.
 */

import React, { useState } from "react";
import {
  View,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
} from "react-native";
import {
  TextInput,
  Button,
  Card,
  HelperText,
  IconButton,
} from "react-native-paper";
import { useRouter } from "expo-router";
import { useAuthStore } from "@/services/authStore";
import { useThemeStore } from "@/services/themeStore";
import { useResponsive } from "@/hooks/useResponsive";

export default function LoginScreen() {
  const router = useRouter();
  const { login, loading, error } = useAuthStore();
  const { colors, toggle, mode } = useThemeStore();
  const { isDesktop } = useResponsive();

  const [username, setUsername] = useState(__DEV__ ? "sager alsager" : "");
  const [password, setPassword] = useState(__DEV__ ? "Admin123!" : "");
  const [showPassword, setShowPassword] = useState(false);
  const [touched, setTouched] = useState({ username: false, password: false });
  const [loginError, setLoginError] = useState<string | null>(null);

  const usernameEmpty = touched.username && !username.trim();
  const passwordEmpty = touched.password && !password.trim();

  const handleLogin = async () => {
    setTouched({ username: true, password: true });
    setLoginError(null);

    if (!username.trim()) {
      setLoginError("Please enter your username");
      return;
    }
    if (!password.trim()) {
      setLoginError("Please enter your password");
      return;
    }

    const ok = await login(username.trim(), password);
    if (ok) {
      router.replace("/(tabs)");
    } else {
      // Show a more helpful error based on the error from the store
      setLoginError(null); // let store error display
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.bgPrimary }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          isDesktop && styles.scrollDesktop,
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Theme toggle */}
        <View style={styles.themeToggleRow}>
          <IconButton
            icon={mode === "dark" ? "weather-sunny" : "weather-night"}
            iconColor={colors.textSecondary}
            size={24}
            onPress={toggle}
            accessibilityLabel="Toggle theme"
          />
        </View>

        {/* Logo / Title */}
        <View style={styles.header}>
          <Text style={[styles.icon]}>📊</Text>
          <Text style={[styles.title, { color: colors.textPrimary }]}>
            Portfolio Tracker
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Sign in to your account
          </Text>
        </View>

        {/* Card */}
        <Card
          style={[
            styles.card,
            {
              backgroundColor: colors.bgCard,
              borderColor: colors.borderColor,
            },
            isDesktop && styles.cardDesktop,
          ]}
          mode="outlined"
        >
          <Card.Content>
            {(loginError || error) ? (
              <View
                style={[
                  styles.errorBox,
                  { backgroundColor: colors.danger + "15" },
                ]}
              >
                <Text style={{ color: colors.danger, textAlign: "center", fontWeight: "600", fontSize: 14 }}>
                  {loginError || error}
                </Text>
                {!loginError && error?.toLowerCase().includes("invalid") ? (
                  <Text style={{ color: colors.danger, textAlign: "center", fontSize: 12, marginTop: 4, opacity: 0.8 }}>
                    Please check your username and password and try again
                  </Text>
                ) : null}
              </View>
            ) : null}

            <TextInput
              label="Username"
              value={username}
              onChangeText={(t) => {
                setUsername(t);
                setLoginError(null);
              }}
              onBlur={() => setTouched((p) => ({ ...p, username: true }))}
              autoCapitalize="none"
              autoCorrect={false}
              disabled={loading}
              left={<TextInput.Icon icon="account" />}
              mode="outlined"
              style={styles.input}
              contentStyle={styles.inputContent}
              outlineColor={usernameEmpty ? colors.danger : colors.borderColor}
              activeOutlineColor={colors.accentPrimary}
              textColor={colors.textPrimary}
              error={usernameEmpty}
              theme={{
                colors: {
                  surfaceVariant: colors.bgInput,
                  onSurfaceVariant: colors.textSecondary,
                  placeholder: colors.textMuted,
                  error: colors.danger,
                },
              }}
            />
            <HelperText
              type="error"
              visible={usernameEmpty}
              style={{ color: colors.danger }}
            >
              Username is required
            </HelperText>

            <TextInput
              label="Password"
              value={password}
              onChangeText={(t) => {
                setPassword(t);
                setLoginError(null);
              }}
              onBlur={() => setTouched((p) => ({ ...p, password: true }))}
              secureTextEntry={!showPassword}
              disabled={loading}
              left={<TextInput.Icon icon="lock" />}
              right={
                <TextInput.Icon
                  icon={showPassword ? "eye-off" : "eye"}
                  onPress={() => setShowPassword(!showPassword)}
                />
              }
              mode="outlined"
              style={styles.input}
              contentStyle={styles.inputContent}
              outlineColor={passwordEmpty ? colors.danger : colors.borderColor}
              activeOutlineColor={colors.accentPrimary}
              textColor={colors.textPrimary}
              error={passwordEmpty}
              onSubmitEditing={handleLogin}
              theme={{
                colors: {
                  surfaceVariant: colors.bgInput,
                  onSurfaceVariant: colors.textSecondary,
                  placeholder: colors.textMuted,
                  error: colors.danger,
                },
              }}
            />
            <HelperText
              type={passwordEmpty ? "error" : "info"}
              visible={passwordEmpty || !touched.password}
              style={{ color: passwordEmpty ? colors.danger : colors.textMuted }}
            >
              {passwordEmpty ? "Password is required" : ""}
            </HelperText>

            <Button
              mode="contained"
              onPress={handleLogin}
              loading={loading}
              disabled={loading || !username.trim() || !password.trim()}
              style={styles.button}
              contentStyle={styles.buttonContent}
              labelStyle={styles.buttonLabel}
              buttonColor={colors.accentPrimary}
              textColor="#ffffff"
            >
              Sign In
            </Button>

            <Button
              mode="text"
              onPress={() => router.push("/(auth)/register")}
              disabled={loading}
              style={styles.registerButton}
              labelStyle={[styles.registerLabel, { color: colors.accentPrimary }]}
            >
              Register as New User
            </Button>
          </Card.Content>
        </Card>

        <Text style={[styles.footer, { color: colors.textMuted }]}>
          Portfolio Mobile — Phase 3
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  scrollDesktop: { paddingHorizontal: 48 },
  themeToggleRow: {
    position: "absolute",
    top: Platform.OS === "web" ? 16 : 48,
    right: 16,
    zIndex: 10,
  },
  header: { alignItems: "center", marginBottom: 28 },
  icon: { fontSize: 56, marginBottom: 12 },
  title: { fontSize: 28, fontWeight: "700", marginBottom: 4 },
  subtitle: { fontSize: 15 },
  card: {
    width: "100%",
    maxWidth: 440,
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
  },
  cardDesktop: { maxWidth: 480 },
  errorBox: { borderRadius: 8, padding: 12, marginBottom: 12 },
  input: {
    marginBottom: 12,
    fontSize: 16,
    backgroundColor: "transparent",
  },
  inputContent: {
    paddingVertical: Platform.OS === "web" ? 10 : 6,
    minHeight: 52,
  },
  button: { marginTop: 12, borderRadius: 10 },
  buttonContent: { paddingVertical: 8 },
  buttonLabel: { fontSize: 16, fontWeight: "700", letterSpacing: 0.5 },
  registerButton: { marginTop: 8 },
  registerLabel: { fontSize: 14, fontWeight: "600" },
  footer: { marginTop: 32, fontSize: 13 },
});
