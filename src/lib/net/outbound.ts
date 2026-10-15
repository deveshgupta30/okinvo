/**
 * The one door to the internet (addendum §1). Server code that must talk to an external host
 * calls `fetchOutbound`; it refuses unless the host is on `OUTBOUND_ALLOW` (comma-separated
 * host names, default empty, so an air-gapped instance never tries), insists on https, and
 * aborts after a timeout. SMTP and the identity providers are configured services, not
 * "outbound" in this sense, and do not pass through here.
 */

export class OutboundBlockedError extends Error {
  constructor(
    readonly url: string,
    reason: string,
  ) {
    super(`outbound request to ${url} refused: ${reason}`);
    this.name = "OutboundBlockedError";
  }
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface OutboundOptions {
  /** Host names (no scheme, no port) that may be contacted. */
  allow: readonly string[];
  fetch?: FetchLike;
  /** Abort after this many milliseconds (default 5 s). */
  timeoutMs?: number;
}

/** `"a.example, B.example,"` → `["a.example", "b.example"]`. */
export function parseAllowList(value: string | undefined | null): string[] {
  return (value ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function createOutboundFetch(o: OutboundOptions): FetchLike {
  const allow = new Set(o.allow.map((h) => h.toLowerCase()));
  const doFetch = o.fetch ?? ((input, init) => fetch(input, init));
  const timeoutMs = o.timeoutMs ?? 5_000;
  return async (input, init) => {
    let url: URL;
    try {
      url = new URL(input);
    } catch {
      throw new OutboundBlockedError(input, "not a valid URL");
    }
    if (url.protocol !== "https:") throw new OutboundBlockedError(input, "only https is allowed");
    if (!allow.has(url.hostname.toLowerCase())) {
      throw new OutboundBlockedError(input, `${url.hostname} is not on OUTBOUND_ALLOW`);
    }
    const signal = init?.signal
      ? AbortSignal.any([init.signal, AbortSignal.timeout(timeoutMs)])
      : AbortSignal.timeout(timeoutMs);
    return doFetch(url.toString(), { ...init, signal });
  };
}

/** The instance's gate, reading `OUTBOUND_ALLOW` from the validated environment on first use. */
export async function fetchOutbound(input: string, init?: RequestInit): Promise<Response> {
  const { env } = await import("@/lib/env");
  return createOutboundFetch({ allow: parseAllowList(env.OUTBOUND_ALLOW) })(input, init);
}
