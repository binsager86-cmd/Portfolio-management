/**
 * useKeyboardShortcuts — register global keyboard shortcuts on web.
 *
 * No-op on native. Cleans up listeners on unmount.
 *
 * Usage:
 *   useKeyboardShortcuts([
 *     { key: "k", ctrl: true, handler: () => openSearch() },
 *     { key: "/",             handler: () => openSearch() },
 *     { key: "ArrowLeft", alt: true, handler: () => router.back() },
 *   ]);
 */

import { useEffect } from "react";
import { Platform } from "react-native";

export interface Shortcut {
  /** The KeyboardEvent.key value (case-insensitive match). */
  key: string;
  /** Require Ctrl (or Cmd on Mac). */
  ctrl?: boolean;
  /** Require Alt (Option on Mac). */
  alt?: boolean;
  /** Require Shift. */
  shift?: boolean;
  /** Handler — called when the shortcut fires. */
  handler: () => void;
  /** If true, preventDefault is NOT called (useful for allowing default browser behavior). */
  allowDefault?: boolean;
}

/**
 * Registers global keyboard shortcuts on web; no-op on native.
 */
export function useKeyboardShortcuts(shortcuts: Shortcut[]): void {
  useEffect(() => {
    if (Platform.OS !== "web" || shortcuts.length === 0) return;

    const onKeyDown = (e: KeyboardEvent) => {
      // Don't intercept when user is typing in an input/textarea/contenteditable
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if ((e.target as HTMLElement)?.isContentEditable) return;

      for (const s of shortcuts) {
        const keyMatch = e.key.toLowerCase() === s.key.toLowerCase();
        const ctrlMatch = s.ctrl ? (e.ctrlKey || e.metaKey) : true;
        const altMatch = s.alt ? e.altKey : true;
        const shiftMatch = s.shift ? e.shiftKey : true;

        // Ensure modifiers aren't pressed when not expected
        const noExtraCtrl = s.ctrl ? true : !(e.ctrlKey || e.metaKey);
        const noExtraAlt = s.alt ? true : !e.altKey;

        if (keyMatch && ctrlMatch && altMatch && shiftMatch && noExtraCtrl && noExtraAlt) {
          if (!s.allowDefault) e.preventDefault();
          s.handler();
          return;
        }
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [shortcuts]);
}
