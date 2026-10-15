/**
 * Force HTTPS (addendum §1). TLS terminates at Caddy or the ingress, so the app sees plain http
 * plus `x-forwarded-proto`. When the flag is on, a request that did not arrive over https is
 * answered with a 301 to the https origin; the health probes are exempt because Compose and
 * Kubernetes call them over http inside the network. Pure functions: the proxy runs on the edge
 * runtime and cannot load the validated env module.
 */

const HEALTH_PREFIX = "/api/health/";

export function arrivedOverHttps(headers: Headers, protocol: string): boolean {
  const forwarded = headers.get("x-forwarded-proto");
  if (forwarded) return forwarded.split(",")[0]!.trim().toLowerCase() === "https";
  return protocol === "https:";
}

export function shouldForceHttps(
  headers: Headers,
  pathname: string,
  protocol: string,
  enabled: boolean,
): boolean {
  if (!enabled) return false;
  if (pathname.startsWith(HEALTH_PREFIX)) return false;
  return !arrivedOverHttps(headers, protocol);
}

/** `FORCE_HTTPS` unset means on in production and off everywhere else. */
export function forceHttpsEnabled(value: string | undefined, nodeEnv: string | undefined): boolean {
  if (value === undefined || value.trim() === "") return nodeEnv === "production";
  return ["true", "1", "yes", "on"].includes(value.trim().toLowerCase());
}
