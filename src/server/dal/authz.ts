import "server-only";
import type { Actor } from "@/server/actor";
import { ForbiddenError } from "./errors";

/**
 * Every state-changing DAL function starts with this (review follow-up): server actions already
 * call requireOwner(), but the DAL is the boundary CLAUDE.md names, and the v1.1 Viewer role must
 * not be able to write through any future caller.
 */
export function requireWriter(actor: Actor): void {
  if (actor.role !== "OWNER") throw new ForbiddenError();
}
