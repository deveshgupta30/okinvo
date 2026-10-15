/**
 * CSRF guard for the custom `POST` routes (`/api/uploads`, …; v2 §14): a browser always sends
 * `Origin` on cross-origin and same-origin POSTs, so a present `Origin` must equal the app's own.
 * Without `Origin`, `Sec-Fetch-Site` (every current browser) must say same-origin or none. A
 * request with neither header is not a browser - curl, a health probe, a script - and passes,
 * since CSRF needs a browser to carry the victim's cookies.
 */
export function originAllowed(headers: Headers, appUrl: string): boolean {
  let own: string;
  try {
    own = new URL(appUrl).origin;
  } catch {
    return false;
  }
  const origin = headers.get("origin");
  if (origin !== null) return origin === own;
  const site = headers.get("sec-fetch-site");
  if (site !== null) return site === "same-origin" || site === "none";
  return true;
}

const UNSAFE = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Which requests the proxy checks: unsafe methods on `/api/*`, except Better Auth's own routes.
 * The proxy additionally skips requests that carry an Authorization header (bearer clients hold
 * no cookies, so there is nothing for a cross-site page to ride on).
 */
export function needsOriginCheck(method: string, pathname: string): boolean {
  if (!UNSAFE.has(method.toUpperCase())) return false;
  if (!pathname.startsWith("/api/")) return false;
  return !pathname.startsWith("/api/auth/");
}
