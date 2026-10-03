import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { forbidden, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { isAdmitted } from "@/server/admission";
import { actorFromSession, type Actor, type Role } from "@/server/actor";
import { scopesForRole, type Scope } from "@/lib/api/scopes";
import { authenticateApiKey, type ApiKeyAuth } from "@/server/dal/api-keys";
import { hasRole } from "@/server/dal/authz";
import { enforceRateLimit } from "@/server/rate-limit";
import { auth } from "@/server/auth-config";

export type AuthSession = NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>;

/** One session lookup per request (React cache); null when anonymous. */
export const getSession = cache(async (): Promise<AuthSession | null> => {
  return auth.api.getSession({ headers: await headers() });
});

/** One allow-list-checked session per request; redirects to sign-in when anonymous. */
const requireSession = cache(async (): Promise<AuthSession> => {
  const s = await getSession();
  if (!s || !(await isAdmitted(s.user.email))) redirect("/auth/sign-in?error=not_allowed");
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
/** `Authorization: Bearer okv_…` → the key's user, else null. */
async function actorFromApiKey(authorization: string | null): Promise<ApiKeyAuth | null> {
  const token = /^Bearer\s+(okv_\S+)$/i.exec(authorization ?? "")?.[1];
  if (!token) return null;
  return authenticateApiKey(token);
}

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
  if (!user || !(await isAdmitted(user.email))) return null;
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
    const byKey = await actorFromApiKey(authorization);
    const actor = byKey
      ? byKey.actor
      : /^Bearer\s+okv_/i.test(authorization)
        ? null
        : await actorFromBearer(authorization, h);
    if (!actor) return Response.json({ error: "unauthenticated" }, { status: 401 });
    if (byKey) {
      const limited = await enforceRateLimit(h, "api", byKey.actor.apiKeyId);
      if (limited) return limited;
    }
    if (!hasRole(actor, min)) return Response.json({ error: "forbidden" }, { status: 403 });
    return actor;
  }
  const s = await getSession();
  if (!s || !(await isAdmitted(s.user.email))) {
    return Response.json({ error: "unauthenticated" }, { status: 401 });
  }
  const actor = actorFromSession(s, h, env.TRUST_PROXY);
  if (!hasRole(actor, min)) return Response.json({ error: "forbidden" }, { status: 403 });
  return actor;
}

/**
 * Scoped variant for the versioned API (spec §7.2): an API key must carry `scope` (403
 * `insufficient_scope` otherwise); a JWT or a cookie session gets the scopes of its role.
 */
export async function requireApiActor(scope: Scope, given?: Headers): Promise<Actor | Response> {
  const r = await requireApiScopes(given);
  if (r instanceof Response) return r;
  if (!r.scopes.includes(scope)) {
    return Response.json(
      { error: { code: "insufficient_scope", message: `This call needs the ${scope} scope.` } },
      { status: 403 },
    );
  }
  return r.actor;
}

/**
 * The actor behind a bearer token or session together with its effective scopes (an API key's
 * stored scopes narrowed by its user's role; a JWT or cookie session gets the scopes of its
 * role). The MCP endpoint registers tools from this list.
 */
export async function requireApiScopes(
  given?: Headers,
): Promise<{ actor: Actor; scopes: Scope[] } | Response> {
  const h = given ?? (await headers());
  const authorization = h.get("authorization");
  let actor: Actor | null = null;
  let scopes: Scope[] = [];
  if (authorization) {
    const byKey = await actorFromApiKey(authorization);
    if (byKey) {
      const limited = await enforceRateLimit(h, "api", byKey.actor.apiKeyId);
      if (limited) return limited;
      actor = byKey.actor;
      scopes = byKey.scopes;
    } else if (!/^Bearer\s+okv_/i.test(authorization)) {
      actor = await actorFromBearer(authorization, h);
      if (actor) scopes = scopesForRole(actor.role);
    }
  } else {
    // Outside a Next request scope (handlers called directly in tests) there is no cookie session.
    const s = await getSession().catch(() => null);
    if (s && (await isAdmitted(s.user.email))) {
      actor = actorFromSession(s, h, env.TRUST_PROXY);
      scopes = scopesForRole(actor.role);
    }
  }
  if (!actor) {
    return Response.json(
      { error: { code: "unauthenticated", message: "Sign in or send a bearer token." } },
      { status: 401 },
    );
  }
  return { actor, scopes };
}

/** Back-compat name: OWNER-only API routes. */
export async function requireOwnerApi(): Promise<Actor | Response> {
  return requireActorApi("OWNER");
}

export async function optionalUser(): Promise<Actor | null> {
  const s = await getSession();
  if (!s || !(await isAdmitted(s.user.email))) return null;
  return actorFromSession(s, await headers(), env.TRUST_PROXY);
}

export function isActor(v: Actor | Response): v is Actor {
  return !(v instanceof Response);
}
