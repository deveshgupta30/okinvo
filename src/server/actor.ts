import { canonicalLocale, DEFAULT_LOCALE } from "@/lib/i18n/languages";
import { clientIp } from "@/lib/rate-limit/memory-ip";

export type Role = "OWNER" | "EDITOR" | "VIEWER";
export const ROLES: readonly Role[] = ["OWNER", "EDITOR", "VIEWER"];

export function parseRole(v: unknown): Role {
  return v === "EDITOR" || v === "VIEWER" ? v : "OWNER";
}

/** The signed-in person a DAL call acts on behalf of (v2 §10). Built once per request. */
export interface Actor {
  userId: string;
  email: string;
  name: string;
  role: Role;
  /** IANA zone used for "today"; "UTC" until the app shell has detected the browser zone. */
  timezone: string;
  /** UI language (a tag from the language table); instants in the app are formatted with it. */
  locale: string;
  ip?: string;
  userAgent?: string;
  /** How the actor authenticated; absent means the browser session. */
  via?: "session" | "jwt" | "api-key";
  apiKeyId?: string;
  apiKeyName?: string;
}

export interface SessionLike {
  user: {
    id: string;
    email: string;
    name: string;
    role?: string | null | undefined;
    timezone?: string | null | undefined;
    locale?: string | null | undefined;
  };
}

export function actorFromSession(s: SessionLike, headers: Headers, trustProxy: boolean): Actor {
  const ip = clientIp(headers, trustProxy, "");
  const userAgent = headers.get("user-agent") ?? undefined;
  return {
    userId: s.user.id,
    email: s.user.email.trim().toLowerCase(),
    name: s.user.name,
    role: parseRole(s.user.role),
    timezone: s.user.timezone || "UTC",
    locale: (s.user.locale && canonicalLocale(s.user.locale)) || DEFAULT_LOCALE,
    ...(ip ? { ip } : {}),
    ...(userAgent ? { userAgent } : {}),
  };
}
