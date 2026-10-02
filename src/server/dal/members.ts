import "server-only";
import { prisma } from "@/lib/db";
import { textToHtml } from "@/lib/email/templates";
import { env } from "@/lib/env";
import type { Actor, Role } from "@/server/actor";
import { audit } from "./audit";
import { requireRole } from "./authz";
import { InvariantError, NotFoundError } from "./errors";
import { sendMail } from "@/lib/email/send";
import { resolveSmtp } from "./smtp-settings";

export interface MemberDto {
  id: string;
  name: string;
  email: string;
  role: Role;
  avatarKey: string | null;
  lastSignInAt: string | null;
  deactivatedAt: string | null;
  createdAt: string;
}

export interface InvitationDto {
  email: string;
  role: Role;
  invitedAt: string;
  invitedBy: string | null;
}

/** Everyone with an account, plus invitations nobody has accepted yet (OWNER only). */
export async function listMembers(
  actor: Actor,
): Promise<{ members: MemberDto[]; invitations: InvitationDto[] }> {
  requireRole(actor, "OWNER");
  const [users, invites] = await Promise.all([
    prisma.user.findMany({
      orderBy: [{ deactivatedAt: "asc" }, { createdAt: "asc" }],
      include: {
        avatar: { select: { storageKey: true } },
        sessions: { orderBy: { updatedAt: "desc" }, take: 1, select: { updatedAt: true } },
      },
    }),
    prisma.allowedEmail.findMany({
      where: { active: true, acceptedAt: null },
      orderBy: { invitedAt: "desc" },
    }),
  ]);
  const existing = new Set(users.map((u) => u.email.toLowerCase()));
  const inviterNames = new Map(users.map((u) => [u.id, u.name]));
  return {
    members: users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      avatarKey: u.avatar?.storageKey ?? null,
      lastSignInAt: u.sessions[0]?.updatedAt.toISOString() ?? null,
      deactivatedAt: u.deactivatedAt?.toISOString() ?? null,
      createdAt: u.createdAt.toISOString(),
    })),
    invitations: invites
      .filter((i) => !existing.has(i.email))
      .map((i) => ({
        email: i.email,
        role: i.role,
        invitedAt: i.invitedAt.toISOString(),
        invitedBy: i.invitedById ? (inviterNames.get(i.invitedById) ?? null) : null,
      })),
  };
}

/**
 * Invites an address: an allow-list row the sign-in hook honours. Sends a plain-text mail when
 * SMTP is configured; the sign-in link is returned either way so the owner can pass it on.
 */
export async function inviteMember(
  actor: Actor,
  input: { email: string; role: Role },
): Promise<{ signInUrl: string; sent: boolean; error?: string }> {
  requireRole(actor, "OWNER");
  const email = input.email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) throw new InvariantError("That address already has an account.");
  await prisma.$transaction(async (tx) => {
    await tx.allowedEmail.upsert({
      where: { email },
      create: { email, role: input.role, invitedById: actor.userId, active: true },
      update: { role: input.role, invitedById: actor.userId, invitedAt: new Date(), active: true },
    });
    await audit(tx, actor, "user.invited", "AllowedEmail", email, {
      summary: `Invited ${email} as ${input.role}`,
      after: { email, role: input.role },
    });
  });
  const signInUrl = `${env.APP_URL}/auth/sign-in`;
  const smtp = await resolveSmtp();
  if (!smtp) return { signInUrl, sent: false };
  try {
    const text = [
      `${actor.name} invited you to okinvo (${env.APP_URL}).`,
      "",
      `Sign in with this address (${email}) at: ${signInUrl}`,
      `Your role: ${input.role.toLowerCase()}.`,
    ].join("\n");
    await sendMail(smtp, {
      to: [email],
      subject: "You're invited to okinvo",
      text,
      html: textToHtml(text),
    });
    return { signInUrl, sent: true };
  } catch (e) {
    return { signInUrl, sent: false, error: (e as Error).message };
  }
}

export async function revokeInvitation(actor: Actor, email: string): Promise<void> {
  requireRole(actor, "OWNER");
  const normalised = email.trim().toLowerCase();
  await prisma.$transaction(async (tx) => {
    const row = await tx.allowedEmail.findUnique({ where: { email: normalised } });
    if (!row) throw new NotFoundError("Invitation", normalised);
    await tx.allowedEmail.delete({ where: { email: normalised } });
    await audit(tx, actor, "user.invitation_revoked", "AllowedEmail", normalised, {
      summary: `Revoked the invitation for ${normalised}`,
      before: { email: normalised, role: row.role },
    });
  });
}

async function assertNotLastOwner(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  userId: string,
): Promise<void> {
  const others = await tx.user.count({
    where: { role: "OWNER", deactivatedAt: null, NOT: { id: userId } },
  });
  if (others === 0) {
    throw new InvariantError("At least one active owner must remain.");
  }
}

export async function setMemberRole(actor: Actor, userId: string, role: Role): Promise<void> {
  requireRole(actor, "OWNER");
  if (userId === actor.userId) throw new InvariantError("Ask another owner to change your role.");
  await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundError("User", userId);
    if (user.role === role) return;
    if (user.role === "OWNER") await assertNotLastOwner(tx, userId);
    await tx.user.update({ where: { id: userId }, data: { role } });
    await tx.allowedEmail.updateMany({ where: { email: user.email }, data: { role } });
    await audit(tx, actor, "user.role_changed", "User", userId, {
      summary: `${user.email}: ${user.role} → ${role}`,
      before: { role: user.role },
      after: { role },
    });
  });
}

/** Ends every session, refuses future sign-ins, keeps the rows for the audit trail. */
export async function deactivateMember(actor: Actor, userId: string): Promise<void> {
  requireRole(actor, "OWNER");
  if (userId === actor.userId) throw new InvariantError("You cannot deactivate yourself.");
  await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundError("User", userId);
    if (user.deactivatedAt) return;
    if (user.role === "OWNER") await assertNotLastOwner(tx, userId);
    await tx.user.update({ where: { id: userId }, data: { deactivatedAt: new Date() } });
    await tx.session.deleteMany({ where: { userId } });
    await tx.allowedEmail.updateMany({ where: { email: user.email }, data: { active: false } });
    await audit(tx, actor, "user.deactivated", "User", userId, {
      summary: `Deactivated ${user.email}`,
    });
  });
}

export async function reactivateMember(actor: Actor, userId: string): Promise<void> {
  requireRole(actor, "OWNER");
  await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundError("User", userId);
    if (!user.deactivatedAt) return;
    await tx.user.update({ where: { id: userId }, data: { deactivatedAt: null } });
    await tx.allowedEmail.updateMany({ where: { email: user.email }, data: { active: true } });
    await audit(tx, actor, "user.reactivated", "User", userId, {
      summary: `Reactivated ${user.email}`,
    });
  });
}
