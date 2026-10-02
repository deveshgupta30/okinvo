import { ACCENTS } from "./accent";

export const THEME_COOKIE = "okinvo.theme";

export type ThemeMode = "dark" | "light" | "system";
export type ResolvedTheme = "dark" | "light";

export function parseThemeMode(value: string | undefined | null): ThemeMode {
  return value === "dark" || value === "light" || value === "system" ? value : "system";
}

/** Server-rendered attribute. `system` starts dark; THEME_INIT_SCRIPT corrects it before first paint. */
export function initialTheme(mode: ThemeMode): ResolvedTheme {
  return mode === "light" ? "light" : "dark";
}

/**
 * Inline, CSP-nonced. Resolves `system` from prefers-color-scheme and follows OS changes live;
 * applies the accent cookie to data-accent (unknown values are ignored, the server default stays).
 */
export const THEME_INIT_SCRIPT =
  '(function(){try{var m=(document.cookie.match(/(?:^|; )okinvo\\.theme=(dark|light|system)(?:;|$)/)||[])[1]||"system";' +
  'var q=matchMedia("(prefers-color-scheme: light)");' +
  'var s=function(){document.documentElement.setAttribute("data-theme",m==="system"?(q.matches?"light":"dark"):m)};' +
  's();if(m==="system"){q.addEventListener("change",s)}' +
  `var a=(document.cookie.match(/(?:^|; )okinvo\\.accent=(${ACCENTS.join("|")})(?:;|$)/)||[])[1];` +
  'if(a){document.documentElement.setAttribute("data-accent",a)}}catch(e){}})();';
