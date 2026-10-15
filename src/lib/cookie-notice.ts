/** The "seen the cookie notice" cookie (spec §6.3): informational, one year, strictly necessary. */
export const COOKIE_NOTICE_COOKIE = "okinvo.cookie-notice";

const YEAR = 60 * 60 * 24 * 365;

/** `document.cookie` assignment that records the dismissal for a year. */
export function cookieNoticeCookie(): string {
  return `${COOKIE_NOTICE_COOKIE}=1; path=/; max-age=${YEAR}; samesite=lax`;
}

/** `document.cookie` assignment that forgets the dismissal (Account → Privacy → show again). */
export function clearCookieNoticeCookie(): string {
  return `${COOKIE_NOTICE_COOKIE}=; path=/; max-age=0; samesite=lax`;
}

export function isCookieNoticeDismissed(cookieHeaderOrValue: string | undefined | null): boolean {
  return cookieHeaderOrValue === "1";
}
