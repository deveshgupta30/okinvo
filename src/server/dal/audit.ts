import "server-only";
import type { Tx } from "@/lib/db";
import type { Actor } from "@/server/actor";
import { redactSensitive } from "./audit-redact";

export type { Tx };

export interface AuditDetails {
  summary?: string;
  before?: unknown;
  after?: unknown;
}

function asJson(v: unknown): object | undefined {
  if (v === undefined || v === null) return undefined;
  return JSON.parse(JSON.stringify(redactSensitive(v))) as object;
}

/**
 * Append-only audit trail (SPEC §4.15). Called inside the same transaction as the change so an
 * event never exists without its change nor a change without its event. Encrypted fields,
 * passwords, secrets and tokens are redacted by key name.
 */
export async function audit(
  tx: Tx,
  actor: Actor | null,
  action: string,
  entityType: string,
  entityId: string,
  details: AuditDetails = {},
): Promise<void> {
  const before = asJson(details.before);
  const after = asJson(details.after);
  // Keys act on behalf of their user; the trail says which key did it.
  const summary =
    actor?.via === "api-key" && actor.apiKeyName
      ? `${details.summary ?? action} (via API key "${actor.apiKeyName}")`
      : (details.summary ?? null);
  const actorExists = actor
    ? (await tx.user.findUnique({ where: { id: actor.userId }, select: { id: true } })) !== null
    : false;
  await tx.auditEvent.create({
    data: {
      actorId: actorExists && actor ? actor.userId : null,
      action,
      entityType,
      entityId,
      summary,
      ...(before !== undefined ? { before } : {}),
      ...(after !== undefined ? { after } : {}),
      ipAddress: actor?.ip ?? null,
      userAgent: actor?.userAgent ?? null,
      actorRole: actor?.role ?? null,
    },
  });
}
