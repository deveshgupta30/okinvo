import "server-only";
import { prisma } from "@/lib/db";
import { parseThemeMode, type ThemeMode } from "@/lib/theme";
import type { AccountInput } from "@/lib/schemas/account-input";
import type { Actor } from "@/server/actor";
import { audit } from "./audit";
import { diffForAudit } from "./audit-redact";
import { NotFoundError } from "./errors";

export interface AccountDto {
  id: string;
  name: string;
  email: string;
  timezone: string | null;
  theme: ThemeMode;
  createdAt: string;
}

export async function getAccount(actor: Actor): Promise<AccountDto> {
  const row = await prisma.user.findUnique({ where: { id: actor.userId } });
  if (!row) throw new NotFoundError("User", actor.userId);
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    timezone: row.timezone,
    theme: parseThemeMode(row.theme),
    createdAt: row.createdAt.toISOString(),
  };
}

/** Settings → Account: display name, timezone and theme (SPEC §4.1, §4.13). */
export async function updateAccount(actor: Actor, input: AccountInput): Promise<AccountDto> {
  return prisma.$transaction(async (tx) => {
    const before = await tx.user.findUnique({ where: { id: actor.userId } });
    if (!before) throw new NotFoundError("User", actor.userId);
    const row = await tx.user.update({
      where: { id: actor.userId },
      data: { name: input.name, timezone: input.timezone, theme: input.theme },
    });
    const view = (u: typeof row) => ({ name: u.name, timezone: u.timezone, theme: u.theme });
    const diff = diffForAudit(view(before), view(row));
    await audit(tx, actor, "account.updated", "User", actor.userId, {
      summary: "Updated account preferences",
      before: diff.before,
      after: diff.after,
    });
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      timezone: row.timezone,
      theme: parseThemeMode(row.theme),
      createdAt: row.createdAt.toISOString(),
    };
  });
}
