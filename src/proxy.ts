import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";
import { shouldRedirectToSignIn } from "@/lib/auth/redirect";
import { buildCsp, securityHeaders } from "@/lib/security-headers";

/** Next 16 proxy: CSP nonce + a convenience redirect — authorization lives in the DAL (v2 §10). */
export function proxy(request: NextRequest): NextResponse {
  const nonce = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString("base64");
  const https =
    request.headers.get("x-forwarded-proto") === "https" || request.nextUrl.protocol === "https:";
  const csp = buildCsp({ nonce, isProd: process.env.NODE_ENV === "production", https });

  const { pathname } = request.nextUrl;
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
