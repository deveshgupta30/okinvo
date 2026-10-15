import "server-only";
import type { Actor, Role } from "@/server/actor";
import { ForbiddenError } from "./errors";

export type { Role };

export const ROLE_RANK: Record<Role, number> = { VIEWER: 0, EDITOR: 1, OWNER: 2 };

export function hasRole(actor: Pick<Actor, "role">, min: Role): boolean {
  return ROLE_RANK[actor.role] >= ROLE_RANK[min];
}

/** The DAL's boundary (spec §9b): throws ForbiddenError below `min`. */
export function requireRole(actor: Pick<Actor, "role">, min: Role): void {
  if (!hasRole(actor, min)) throw new ForbiddenError(messageFor(min));
}

/**
 * Every state-changing DAL function on business records starts with this: OWNER and EDITOR may
 * write; VIEWER may not. Settings functions call `requireRole(actor, "OWNER")` instead.
 */
export function requireWriter(actor: Pick<Actor, "role">): void {
  requireRole(actor, "EDITOR");
}

function messageFor(min: Role): string {
  return min === "OWNER"
    ? "Only an owner can change settings."
    : "This account can only view data.";
}
