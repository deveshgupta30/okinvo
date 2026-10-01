import "server-only";
import { headers } from "next/headers";
import { prisma } from "@/lib/db";
import type { Actor } from "@/server/actor";
import { auth } from "@/server/auth-config";
import { getSession } from "@/server/auth";
import { audit } from "./audit";
import { NotFoundError } from "./errors";

export interface SessionDto {
  id: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  current: boolean;
}

/** Active sessions of the signed-in person; tokens never leave the server. */
export async function listSessions(_actor: Actor): Promise<SessionDto[]> {
  const [h, current] = await Promise.all([headers(), getSession()]);
  const rows = await auth.api.listSessions({ headers: h });
  return rows
    .map((s) => ({
      id: s.id,
      ipAddress: s.ipAddress ?? null,
      userAgent: s.userAgent ?? null,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
      expiresAt: s.expiresAt.toISOString(),
      current: s.id === current?.session.id,
    }))
    .sort(
      (a, b) => Number(b.current) - Number(a.current) || b.updatedAt.localeCompare(a.updatedAt),
    );
}

export async function revokeSessionById(actor: Actor, sessionId: string): Promise<void> {
  const h = await headers();
  const rows = await auth.api.listSessions({ headers: h });
  const target = rows.find((s) => s.id === sessionId);
  if (!target) throw new NotFoundError("Session", sessionId);
  await auth.api.revokeSession({ headers: h, body: { token: target.token } });
  await audit(prisma, actor, "auth.session_revoked", "Session", sessionId, {
    summary: "Revoked a session",
    before: { ipAddress: target.ipAddress ?? null, userAgent: target.userAgent ?? null },
  });
}

export async function revokeOtherSessions(actor: Actor): Promise<number> {
  const h = await headers();
  const current = await getSession();
  const rows = await auth.api.listSessions({ headers: h });
  const others = rows.filter((s) => s.id !== current?.session.id);
  await auth.api.revokeOtherSessions({ headers: h });
  for (const s of others) {
    await audit(prisma, actor, "auth.session_revoked", "Session", s.id, {
      summary: "Signed out everywhere else",
      before: { ipAddress: s.ipAddress ?? null, userAgent: s.userAgent ?? null },
    });
  }
  return others.length;
}
