"use client";

import { useEffect } from "react";
import { ACCENT_COOKIE, type AccentId } from "@/lib/accent";
import { THEME_COOKIE, type ThemeMode } from "@/lib/theme";
import { applyTheme } from "./theme-toggle";

function cookieValue(name: string): string | undefined {
  return document.cookie.match(new RegExp(`(?:^|; )${name.replace(".", "\\.")}=([^;]*)`))?.[1];
}

/**
 * A browser that has no preference cookies yet (new device, cleared cookies) gets them from the
 * account, so the stored theme and accent win over "system" after sign-in (spec §3.3).
 */
export function PreferenceSync({ theme, accent }: { theme: ThemeMode; accent: AccentId }) {
  useEffect(() => {
    if (cookieValue(THEME_COOKIE) === undefined) applyTheme(theme);
    if (cookieValue(ACCENT_COOKIE) !== accent) {
      document.cookie = `${ACCENT_COOKIE}=${accent}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
      document.documentElement.setAttribute("data-accent", accent);
    }
  }, [theme, accent]);
  return null;
}
