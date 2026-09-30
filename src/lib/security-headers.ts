export interface CspOptions {
  nonce: string;
  isProd: boolean;
  /** Whether this request arrived over https (directly or via a trusted proxy). */
  https?: boolean;
  /** Extra origins allowed as form-action targets (identity providers, added in M1). */
  formActionOrigins?: string[];
}

export function buildCsp({
  nonce,
  isProd,
  https = false,
  formActionOrigins = [],
}: CspOptions): string {
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isProd ? "" : " 'unsafe-eval'"}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    isProd ? "connect-src 'self'" : "connect-src 'self' ws: wss:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    `form-action 'self'${formActionOrigins.map((o) => ` ${o}`).join("")}`,
    "object-src 'none'",
  ];
  // Only meaningful when the page itself is https; on plain-http production (LAN, CI) some
  // browsers would upgrade sub-resource requests to an https origin that does not exist.
  if (isProd && https) directives.push("upgrade-insecure-requests");
  return directives.join("; ");
}

export function securityHeaders({
  csp,
  https,
}: {
  csp: string;
  https: boolean;
}): [string, string][] {
  const headers: [string, string][] = [
    ["Content-Security-Policy", csp],
    ["X-Content-Type-Options", "nosniff"],
    ["Referrer-Policy", "strict-origin-when-cross-origin"],
    ["Permissions-Policy", "camera=(), microphone=(), geolocation=()"],
    ["Cross-Origin-Opener-Policy", "same-origin"],
    ["X-Frame-Options", "DENY"],
  ];
  if (https) headers.push(["Strict-Transport-Security", "max-age=31536000; includeSubDomains"]);
  return headers;
}
