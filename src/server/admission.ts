import "server-only";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { isAllowedEmail } from "@/server/allow-list";

/**
 * Who may sign in (spec §9b): an address on the AUTH_ALLOWED_EMAILS list (the bootstrap), or an
 * active invitation row written from Settings → Users. A deactivated account is never admitted,
 * whichever list it came from.
 */
export async function isAdmitted(email: string): Promise<boolean> {
  const normalised = email.trim().toLowerCase();
  const user = await prisma.user.findUnique({
    where: { email: normalised },
    select: { deactivatedAt: true },
  });
  if (user?.deactivatedAt) return false;
  if (isAllowedEmail(normalised, env.allowList)) return true;
  const invited = await prisma.allowedEmail.findUnique({
    where: { email: normalised },
    select: { active: true },
  });
  return invited?.active === true;
}

/** The role an invitation carries, or null when the address is only on the env list. */
export async function invitedRole(email: string): Promise<"OWNER" | "EDITOR" | "VIEWER" | null> {
  const row = await prisma.allowedEmail.findUnique({
    where: { email: email.trim().toLowerCase() },
    select: { role: true, active: true },
  });
  return row?.active ? row.role : null;
}
