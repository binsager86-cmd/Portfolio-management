import { useEffect } from "react";
import { Platform } from "react-native";

/**
 * Sets document title and meta description on web.
 * No-op on native platforms.
 */
export function useWebMeta(title: string, description?: string) {
  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;

    document.title = title;

    if (description) {
      let meta = document.querySelector('meta[name="description"]') as HTMLMetaElement | null;
      if (!meta) {
        meta = document.createElement("meta");
        meta.name = "description";
        document.head.appendChild(meta);
      }
      meta.content = description;
    }
  }, [title, description]);
}
