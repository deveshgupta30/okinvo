import { clientIp } from "@/lib/rate-limit/memory-ip";

/** The signed-in person a DAL call acts on behalf of (v2 §10). Built once per request. */
export interface Actor {
  userId: string;
  email: string;
  name: string;
  role: "OWNER" | "VIEWER";
  /** IANA zone used for "today"; "UTC" until the app shell has detected the browser zone. */
  timezone: string;
  ip?: string;
  userAgent?: string;
}

export interface SessionLike {
  user: {
    id: string;
    email: string;
    name: string;
    role?: string | null | undefined;
    timezone?: string | null | undefined;
  };
}

export function actorFromSession(s: SessionLike, headers: Headers, trustProxy: boolean): Actor {
  const ip = clientIp(headers, trustProxy, "");
  const userAgent = headers.get("user-agent") ?? undefined;
  return {
    userId: s.user.id,
    email: s.user.email.trim().toLowerCase(),
    name: s.user.name,
    role: s.user.role === "VIEWER" ? "VIEWER" : "OWNER",
    timezone: s.user.timezone || "UTC",
    ...(ip ? { ip } : {}),
    ...(userAgent ? { userAgent } : {}),
  };
}
