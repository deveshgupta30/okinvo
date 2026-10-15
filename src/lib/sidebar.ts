/**
 * Sidebar state (spec §3.3): a cookie written by the browser so the server paints the right width
 * on the first byte. No server action is involved (plan R2).
 */
export const SIDEBAR_COOKIE = "okinvo.sidebar";
export type SidebarState = "expanded" | "collapsed";

export function parseSidebar(v: unknown): SidebarState {
  return v === "collapsed" ? "collapsed" : "expanded";
}

/** The `document.cookie` assignment that persists `state` for a year. */
export function sidebarCookie(state: SidebarState): string {
  return `${SIDEBAR_COOKIE}=${state}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
}
