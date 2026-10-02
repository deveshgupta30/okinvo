import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { forbidden, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { isAllowedEmail } from "@/server/allow-list";
import { actorFromSession, type Actor, type Role } from "@/server/actor";
import { hasRole } from "@/server/dal/authz";
import { auth } from "@/server/auth-config";

export type AuthSession = NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>;

/** One session lookup per request (React cache); null when anonymous. */
export const getSession = cache(async (): Promise<AuthSession | null> => {
  return auth.api.getSession({ headers: await headers() });
});

/** One allow-list-checked session per request; redirects to sign-in when anonymous. */
const requireSession = cache(async (): Promise<AuthSession> => {
  const s = await getSession();
  if (!s || !isAllowedEmail(s.user.email, env.allowList)) redirect("/auth/sign-in");
  return s;
});

/**
 * Page helper: redirects to sign-in when anonymous or no longer allow-listed, and to the first-run
 * wizard until onboarding is complete (spec §4.2) unless the caller is the wizard itself or the
 * shell around it (`allowOnboarding`). The session user carries `onboardedAt` (Better Auth
 * additional field), so this costs no extra query.
 */
export async function requireUser(opts: { allowOnboarding?: boolean } = {}): Promise<AuthSession> {
  const s = await requireSession();
  if (!opts.allowOnboarding && !onboarded(s)) redirect("/onboarding");
  return s;
}

function onboarded(s: AuthSession): boolean {
  const v = (s.user as { onboardedAt?: Date | string | null }).onboardedAt;
  return v !== null && v !== undefined;
}

/**
 * The only way a server action or page obtains an Actor for the DAL: the signed-in, onboarded
 * person, at least `min` (spec §9b). Below it the page is a 403 (`forbidden()`).
 */
export async function requireRole(min: Role): Promise<Actor> {
  const s = await requireUser();
  const actor = actorFromSession(s, await headers(), env.TRUST_PROXY);
  if (!hasRole(actor, min)) forbidden();
  return actor;
}

/** OWNER-only pages and actions (settings). */
export async function requireOwner(): Promise<Actor> {
  return requireRole("OWNER");
}

/**
 * `Authorization: Bearer <jwt>` → Actor, or null. The token (minted at /api/auth/token) is
 * verified against the JWT plugin's keys, then the user is re-read so a deleted user, a removed
 * allow-list entry or a changed role takes effect within the token's 15-minute life.
 */
export async function actorFromBearer(
  authorization: string | null,
  headers: Headers,
): Promise<Actor | null> {
  const token = /^Bearer\s+(\S+)$/i.exec(authorization ?? "")?.[1];
  if (!token) return null;
  let payload: Record<string, unknown> | null;
  try {
    // An invalid or expired token comes back as a null payload (some failures throw instead).
    ({ payload } = (await auth.api.verifyJWT({ body: { token } })) as {
      payload: Record<string, unknown> | null;
    });
  } catch {
    return null;
  }
  const sub = payload && typeof payload.sub === "string" ? payload.sub : null;
  if (!sub) return null;
  const user = await prisma.user.findUnique({ where: { id: sub } });
  if (!user || !isAllowedEmail(user.email, env.allowList)) return null;
  return actorFromSession(
    {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        timezone: user.timezone,
      },
    },
    headers,
    env.TRUST_PROXY,
  );
}

/**
 * Route-handler variant: identical checks, but a 401/403 Response instead of a redirect. A bearer
 * token is honoured before the cookie session, so API clients never need cookies.
 */
export async function requireActorApi(min: Role = "OWNER"): Promise<Actor | Response> {
  const h = await headers();
  const authorization = h.get("authorization");
  if (authorization) {
    const actor = await actorFromBearer(authorization, h);
    if (!actor) return Response.json({ error: "unauthenticated" }, { status: 401 });
    if (!hasRole(actor, min)) return Response.json({ error: "forbidden" }, { status: 403 });
    return actor;
  }
  const s = await getSession();
  if (!s || !isAllowedEmail(s.user.email, env.allowList)) {
    return Response.json({ error: "unauthenticated" }, { status: 401 });
  }
  const actor = actorFromSession(s, h, env.TRUST_PROXY);
  if (!hasRole(actor, min)) return Response.json({ error: "forbidden" }, { status: 403 });
  return actor;
}

/** Back-compat name: OWNER-only API routes. */
export async function requireOwnerApi(): Promise<Actor | Response> {
  return requireActorApi("OWNER");
}

export async function optionalUser(): Promise<Actor | null> {
  const s = await getSession();
  if (!s || !isAllowedEmail(s.user.email, env.allowList)) return null;
  return actorFromSession(s, await headers(), env.TRUST_PROXY);
}

export function isActor(v: Actor | Response): v is Actor {
  return !(v instanceof Response);
}
