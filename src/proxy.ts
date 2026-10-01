import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";
import { idpFormActionOrigins } from "@/lib/auth/idp-origins";
import { shouldRedirectToSignIn } from "@/lib/auth/redirect";
import { buildCsp, securityHeaders } from "@/lib/security-headers";
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

  // CSRF guard for the custom API routes (Better Auth checks its own; Server Actions are
  // same-origin by construction). `APP_URL` is validated at boot; here it is only compared.
  if (
    needsOriginCheck(request.method, pathname) &&
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
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  for (const [key, value] of securityHeaders({ csp, https })) response.headers.set(key, value);
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!_next/static|_next/image|favicon.ico|robots.txt).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
