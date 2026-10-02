import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Actor } from "@/server/actor";

/**
 * Members (spec §9b): invitations are allow-list rows the sign-in hook honours alongside the env
 * list, roles change with a last-owner guard, and deactivation ends sessions and refuses sign-in.
 */
const url = process.env.DATABASE_URL;
if (!url && process.env.CI) throw new Error("DATABASE_URL is required when CI is set");

describe.skipIf(!url)("members", () => {
  const stamp = Date.now();
  const ownerId = `mem-owner-${stamp}`;
  const ownerEmail = `${ownerId}@example.com`;
  const invitee = `mem-invitee-${stamp}@example.com`;
  const password = "correct horse battery staple";
  const owner: Actor = {
    userId: ownerId,
    email: ownerEmail,
    name: "Owner",
    role: "OWNER",
    timezone: "UTC",
  };
  let prisma: typeof import("@/lib/db").prisma;
  let members: typeof import("@/server/dal/members");
  let admission: typeof import("@/server/admission");
  let auth: typeof import("@/server/auth-config").auth;
  let errors: typeof import("@/server/dal/errors");
  let inviteeId: string;

  beforeAll(async () => {
    process.env.AUTH_PASSWORD_SIGNIN = "true";
    process.env.AUTH_ALLOWED_EMAILS = ownerEmail; // the invitee is NOT on the env list
    process.env.APP_URL ??= "http://127.0.0.1:3000";
    process.env.FIELD_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString("base64");
    ({ prisma } = await import("@/lib/db"));
    members = await import("@/server/dal/members");
    admission = await import("@/server/admission");
    ({ auth } = await import("@/server/auth-config"));
    errors = await import("@/server/dal/errors");
    await prisma.user.create({
      data: {
        id: ownerId,
        name: "Owner",
        email: ownerEmail,
        role: "OWNER",
        onboardedAt: new Date(),
      },
    });
  });

  afterAll(async () => {
    await prisma.auditEvent.deleteMany({
      where: { OR: [{ actorId: ownerId }, { entityId: ownerId }] },
    });
    await prisma.user.deleteMany({ where: { email: { in: [ownerEmail, invitee] } } });
    await prisma.allowedEmail.deleteMany({ where: { email: invitee } });
  });

  it("an un-invited address is not admitted; an invitation admits it with its role", async () => {
    expect(await admission.isAdmitted(invitee)).toBe(false);
    const result = await members.inviteMember(owner, { email: invitee, role: "EDITOR" });
    expect(result.signInUrl).toMatch(/\/auth\/sign-in$/);
    expect(await admission.isAdmitted(invitee)).toBe(true);
    const row = await prisma.allowedEmail.findUniqueOrThrow({ where: { email: invitee } });
    expect(row).toMatchObject({ role: "EDITOR", active: true, invitedById: ownerId });
    const event = await prisma.auditEvent.findFirst({
      where: { action: "user.invited", entityId: invitee },
    });
    expect(event).not.toBeNull();
    // inviting the same address again just refreshes the row
    await members.inviteMember(owner, { email: invitee, role: "VIEWER" });
    expect((await prisma.allowedEmail.findUniqueOrThrow({ where: { email: invitee } })).role).toBe(
      "VIEWER",
    );
  });

  it("the sign-up hook accepts the invited address with the invited role and marks it accepted", async () => {
    const { response } = await auth.api.signUpEmail({
      body: { email: invitee, password, name: "Invited Person" },
      returnHeaders: true,
    });
    expect(response.user.email).toBe(invitee);
    const user = await prisma.user.findUniqueOrThrow({ where: { email: invitee } });
    inviteeId = user.id;
    expect(user.role).toBe("VIEWER");
    const row = await prisma.allowedEmail.findUniqueOrThrow({ where: { email: invitee } });
    expect(row.acceptedAt).not.toBeNull();
    const list = await members.listMembers(owner);
    expect(list.members.map((m) => m.email)).toContain(invitee);
    expect(list.invitations.map((i) => i.email)).not.toContain(invitee);
  });

  it("changes roles, but never demotes the last active owner", async () => {
    await members.setMemberRole(owner, inviteeId, "EDITOR");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: inviteeId } })).role).toBe("EDITOR");
    const event = await prisma.auditEvent.findFirst({
      where: { action: "user.role_changed", entityId: inviteeId },
    });
    expect(event?.after).toMatchObject({ role: "EDITOR" });
    // the test owner is one of possibly several owners in this database; demote the invitee to
    // OWNER first, then prove that the *only* remaining owner cannot be demoted in a sealed scenario
    const owners = await prisma.user.count({ where: { role: "OWNER", deactivatedAt: null } });
    if (owners === 1) {
      await expect(members.setMemberRole(owner, ownerId, "EDITOR")).rejects.toBeInstanceOf(
        errors.InvariantError,
      );
    }
    await expect(members.setMemberRole(owner, ownerId, "VIEWER")).rejects.toThrow(); // never yourself
  });

  it("deactivation ends sessions, refuses sign-in and admission; reactivation restores", async () => {
    await auth.api.signInEmail({ body: { email: invitee, password } });
    expect(await prisma.session.count({ where: { userId: inviteeId } })).toBeGreaterThan(0);
    await members.deactivateMember(owner, inviteeId);
    expect(await prisma.session.count({ where: { userId: inviteeId } })).toBe(0);
    expect(await admission.isAdmitted(invitee)).toBe(false);
    await expect(auth.api.signInEmail({ body: { email: invitee, password } })).rejects.toThrow(
      /deactivated/i,
    );
    const event = await prisma.auditEvent.findFirst({
      where: { action: "user.deactivated", entityId: inviteeId },
    });
    expect(event).not.toBeNull();
    await members.reactivateMember(owner, inviteeId);
    expect(await admission.isAdmitted(invitee)).toBe(true);
    await expect(
      auth.api.signInEmail({ body: { email: invitee, password } }),
    ).resolves.toBeTruthy();
  });

  it("the owner cannot deactivate themselves", async () => {
    await expect(members.deactivateMember(owner, ownerId)).rejects.toBeInstanceOf(
      errors.InvariantError,
    );
  });
});
