/**
 * AppErrorBoundary — React class-component error boundary.
 *
 * Catches uncaught render errors in its subtree and displays
 * a themed fallback screen with a "Try Again" button that
 * resets the boundary state.
 */

import React, { Component } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

interface Props {
  children: React.ReactNode;
  /** Optional context-specific message shown below the title. */
  fallbackMessage?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    if (__DEV__) {
      console.error("[ErrorBoundary]", error, info.componentStack);
    }
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <Text style={styles.emoji}>💥</Text>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.message}>
            {this.props.fallbackMessage ??
              this.state.error?.message ??
              "An unexpected error occurred."}
          </Text>
          <Pressable onPress={this.handleReset} style={styles.button}>
            <Text style={styles.buttonText}>Try Again</Text>
          </Pressable>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
    backgroundColor: "#0a0a15",
  },
  emoji: { fontSize: 48, marginBottom: 16 },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: "#e6e6f0",
    marginBottom: 8,
  },
  message: {
    fontSize: 14,
    color: "#a0a0b0",
    textAlign: "center",
    marginBottom: 24,
    maxWidth: 320,
  },
  button: {
    backgroundColor: "#6366f1",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  buttonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 15,
  },
});

/**
 * HOC that wraps a screen component in an AppErrorBoundary.
 * Works with expo-router's declarative Tabs.Screen (which doesn't
 * support render-function children).
 */
export function withErrorBoundary<P extends object>(
  ScreenComponent: React.ComponentType<P>,
  fallbackMessage?: string,
) {
  const Wrapped = (props: P) => (
    <AppErrorBoundary fallbackMessage={fallbackMessage}>
      <ScreenComponent {...props} />
    </AppErrorBoundary>
  );
  Wrapped.displayName = `withErrorBoundary(${ScreenComponent.displayName || ScreenComponent.name || "Component"})`;
  return Wrapped;
}
