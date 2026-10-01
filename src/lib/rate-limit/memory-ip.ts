/**
 * Client IP from request headers. The first X-Forwarded-For hop is used only when the deployment
 * says it sits behind a trusted proxy (TRUST_PROXY); otherwise anyone could spoof their address
 * and dodge per-IP limits. Kept separate from the rate-limit index so the actor module can import
 * it without pulling the limiter in.
 */
export function clientIp(headers: Headers, trustProxy: boolean, fallback = "unknown"): string {
  if (trustProxy) {
    const xff = headers.get("x-forwarded-for");
    const first = xff?.split(",")[0]?.trim();
    if (first) return first;
    const real = headers.get("x-real-ip")?.trim();
    if (real) return real;
  }
  return fallback;
}
