/**
 * Convenience redirect for anonymous page navigations. Authorization itself lives in the DAL
 * (`requireUser` / `requireOwner`); this only spares a signed-out person a 403 page.
 */
const PUBLIC_PREFIXES = [
  "/auth/",
  "/verify/",
  "/i/",
  "/legal/",
  "/api/",
  "/_next/",
  "/icons/",
  "/flags/",
];
const PUBLIC_FILES = new Set([
  "/favicon.ico",
  "/robots.txt",
  "/sitemap.xml",
  "/icon.svg",
  "/apple-icon.png",
  "/manifest.webmanifest",
]);

export function shouldRedirectToSignIn(pathname: string, hasSessionCookie: boolean): boolean {
  if (hasSessionCookie) return false;
  if (PUBLIC_FILES.has(pathname)) return false;
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) return false;
  return true;
}
