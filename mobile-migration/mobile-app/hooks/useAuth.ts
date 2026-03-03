/**
 * Convenience hook — thin wrapper around the Zustand auth store.
 *
 * Provides an interface matching `{ user, token, login, logout, loading, error }`
 * so screens don't import the store directly and the shape
 * can be swapped later without touching every consumer.
 */

import { useMemo } from "react";
import { useAuthStore } from "@/services/authStore";

export interface AuthUser {
  id: number;
  username: string;
  name: string | null;
}

export function useAuth() {
  const token = useAuthStore((s) => s.token);
  const userId = useAuthStore((s) => s.userId);
  const username = useAuthStore((s) => s.username);
  const name = useAuthStore((s) => s.name);
  const loading = useAuthStore((s) => s.loading);
  const error = useAuthStore((s) => s.error);
  const login = useAuthStore((s) => s.login);
  const logout = useAuthStore((s) => s.logout);

  const user: AuthUser | null = useMemo(() => {
    if (!userId || !username) return null;
    return { id: userId, username, name };
  }, [userId, username, name]);

  const isAuthenticated = !!token;

  return { user, token, isAuthenticated, loading, error, login, logout };
}
