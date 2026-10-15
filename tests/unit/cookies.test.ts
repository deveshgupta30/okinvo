import { describe, expect, it } from "vitest";
import { ACCENT_COOKIE } from "@/lib/accent";
import {
  clearCookieNoticeCookie,
  COOKIE_NOTICE_COOKIE,
  cookieNoticeCookie,
  isCookieNoticeDismissed,
} from "@/lib/cookie-notice";
import { APP_COOKIES } from "@/lib/cookies";
import { shareCookieName } from "@/lib/security/share-cookie";
import { SIDEBAR_COOKIE } from "@/lib/sidebar";
import { THEME_COOKIE } from "@/lib/theme";

/**
 * The cookie registry (spec §6.3) is the single source for the notice, the policy page and the
 * Account → Privacy card: every cookie the code sets must be listed, all strictly necessary.
 */
describe("APP_COOKIES", () => {
  it("lists every cookie the app sets", () => {
    const names = APP_COOKIES.map((c) => c.name);
    for (const n of [
      "better-auth.session_token",
      THEME_COOKIE,
      ACCENT_COOKIE,
      SIDEBAR_COOKIE,
      "okinvo.locale",
      COOKIE_NOTICE_COOKIE,
    ]) {
      expect(names, n).toContain(n);
    }
    // share cookies are per link: listed once with a placeholder
    expect(names).toContain("okinvo.share.<link>");
    expect(shareCookieName("abc")).toMatch(/^okinvo\.share\./);
  });

  it("is all strictly necessary, with a purpose and a lifetime each", () => {
    for (const c of APP_COOKIES) {
      expect(c.kind).toBe("necessary");
      expect(c.purpose.length).toBeGreaterThan(10);
      expect(c.lifetime.length).toBeGreaterThan(2);
    }
    expect(new Set(APP_COOKIES.map((c) => c.name)).size).toBe(APP_COOKIES.length);
  });
});

describe("cookie notice cookie", () => {
  it("sets for a year, clears with max-age 0, and reads only the exact value", () => {
    expect(cookieNoticeCookie()).toBe(
      "okinvo.cookie-notice=1; path=/; max-age=31536000; samesite=lax",
    );
    expect(clearCookieNoticeCookie()).toBe(
      "okinvo.cookie-notice=; path=/; max-age=0; samesite=lax",
    );
    expect(isCookieNoticeDismissed("1")).toBe(true);
    expect(isCookieNoticeDismissed(undefined)).toBe(false);
    expect(isCookieNoticeDismissed("yes")).toBe(false);
  });
});
