import { getSessionCookie } from "better-auth/cookies";
import { ALLOW_HEADER, disallowedVerb } from "@/lib/api/methods";
import { NextResponse, type NextRequest } from "next/server";
import { idpFormActionOrigins } from "@/lib/auth/idp-origins";
import { shouldRedirectToSignIn } from "@/lib/auth/redirect";
import { buildCsp, securityHeaders } from "@/lib/security-headers";
import { forceHttpsEnabled, shouldForceHttps } from "@/lib/security/force-https";
import { needsOriginCheck, originAllowed } from "@/lib/security/origin";

/**
 * Next 16 proxy: CSP nonce, an Origin check on the custom POST routes, and a convenience redirect.
 * Authorization lives in the DAL (v2 §10); nothing here is the security boundary for data.
 */
export function proxy(request: NextRequest): NextResponse {
  const nonce = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString("base64");
  const https =
    request.headers.get("x-forwarded-proto") === "https" || request.nextUrl.protocol === "https:";
  const csp = buildCsp({
    nonce,
    isProd: process.env.NODE_ENV === "production",
    https,
    formActionOrigins: idpFormActionOrigins(process.env),
  });
  const { pathname } = request.nextUrl;

  // Force HTTPS (addendum §1): TLS ends at Caddy or the ingress; a request that arrived over
  // plain http is sent to the https origin, except the in-network health probes.
  if (
    shouldForceHttps(
      request.headers,
      pathname,
      request.nextUrl.protocol,
      forceHttpsEnabled(process.env.FORCE_HTTPS, process.env.NODE_ENV),
    )
  ) {
    const url = request.nextUrl.clone();
    url.protocol = "https:";
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    if (host) url.host = host;
    url.port = "";
    return NextResponse.redirect(url, 301);
  }

  // The versioned API and the MCP endpoint never delete or rewrite (SPEC §4.19).
  if (disallowedVerb(request.method, pathname)) {
    const denied = NextResponse.json(
      { error: { code: "method_not_allowed", message: `${request.method} is not offered here.` } },
      { status: 405, headers: { Allow: ALLOW_HEADER } },
    );
    for (const [key, value] of securityHeaders({ csp, https })) denied.headers.set(key, value);
    return denied;
  }

  // CSRF guard for the custom API routes (Better Auth checks its own; Server Actions are
  // same-origin by construction). `APP_URL` is validated at boot; here it is only compared.
  // A request carrying an Authorization header is not cookie-authenticated, so CSRF does not apply.
  if (
    needsOriginCheck(request.method, pathname) &&
    !request.headers.has("authorization") &&
    !originAllowed(request.headers, process.env.APP_URL ?? "")
  ) {
    const denied = NextResponse.json({ error: "bad_origin" }, { status: 403 });
    for (const [key, value] of securityHeaders({ csp, https })) denied.headers.set(key, value);
    return denied;
  }

  if (shouldRedirectToSignIn(pathname, getSessionCookie(request) !== null)) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/sign-in";
    url.search = "";
    const redirect = NextResponse.redirect(url);
    for (const [key, value] of securityHeaders({ csp, https })) redirect.headers.set(key, value);
    return redirect;
  }

  // Next reads the CSP from the *request* headers to nonce its own inline scripts;
  // the root layout reads x-nonce for the theme script.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("x-pathname", pathname); // the app layout's local page-view counter
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  for (const [key, value] of securityHeaders({ csp, https })) response.headers.set(key, value);
  return response;
}

export const config = {
  matcher: [
    {
      source:
        "/((?!_next/static|_next/image|favicon.ico|robots.txt|icon.svg|apple-icon.png|manifest.webmanifest|icons/|flags/).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
