import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { forbidden, redirect } from "next/navigation";
import { env } from "@/lib/env";
import { isAllowedEmail } from "@/server/allow-list";
import { actorFromSession, type Actor } from "@/server/actor";
import { auth } from "@/server/auth-config";

export type AuthSession = NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>;

/** One session lookup per request (React cache); null when anonymous. */
export const getSession = cache(async (): Promise<AuthSession | null> => {
  return auth.api.getSession({ headers: await headers() });
});

/** Page helper: redirects to sign-in when anonymous or no longer allow-listed. */
export const requireUser = cache(async (): Promise<AuthSession> => {
  const s = await getSession();
  if (!s || !isAllowedEmail(s.user.email, env.allowList)) redirect("/auth/sign-in");
  return s;
});

/** The only way a server action or page obtains an Actor for the DAL. */
export async function requireOwner(): Promise<Actor> {
  const s = await requireUser();
  if (s.user.role !== "OWNER") forbidden();
  return actorFromSession(s, await headers(), env.TRUST_PROXY);
}

/** Route-handler variant: identical checks, but a 401/403 Response instead of a redirect. */
export async function requireOwnerApi(): Promise<Actor | Response> {
  const s = await getSession();
  if (!s || !isAllowedEmail(s.user.email, env.allowList)) {
    return Response.json({ error: "unauthenticated" }, { status: 401 });
  }
  if (s.user.role !== "OWNER") return Response.json({ error: "forbidden" }, { status: 403 });
  return actorFromSession(s, await headers(), env.TRUST_PROXY);
}

export async function optionalUser(): Promise<Actor | null> {
  const s = await getSession();
  if (!s || !isAllowedEmail(s.user.email, env.allowList)) return null;
  return actorFromSession(s, await headers(), env.TRUST_PROXY);
}

export function isActor(v: Actor | Response): v is Actor {
  return !(v instanceof Response);
}
