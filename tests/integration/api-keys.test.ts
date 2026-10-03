import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Actor } from "@/server/actor";

/**
 * API keys (spec §7.1): create once, authenticate by hash, revoked and expired keys die, a role
 * ceiling caps scopes at creation and again at every use (Review Focus 1).
 */
const url = process.env.DATABASE_URL;
if (!url && process.env.CI) throw new Error("DATABASE_URL is required when CI is set");

const tag = `apikey-${Date.now()}`;
const ownerId = `${tag}-owner`;
const editorId = `${tag}-editor`;
const viewerId = `${tag}-viewer`;
const actorFor = (userId: string, email: string, role: Actor["role"]): Actor => ({
  userId,
  email,
  name: role,
  role,
  timezone: "UTC",
});

describe.skipIf(!url)("API keys", () => {
  let prisma: typeof import("@/lib/db").prisma;
  let keys: typeof import("@/server/dal/api-keys");
  let errors: typeof import("@/server/dal/errors");
  const owner = actorFor(ownerId, `${tag}-owner@example.com`, "OWNER");
  const editor = actorFor(editorId, `${tag}-editor@example.com`, "EDITOR");
  const viewer = actorFor(viewerId, `${tag}-viewer@example.com`, "VIEWER");

  beforeAll(async () => {
    process.env.FIELD_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString("base64");
    process.env.AUTH_ALLOWED_EMAILS = `*@example.com,${process.env.AUTH_ALLOWED_EMAILS ?? ""}`;
    ({ prisma } = await import("@/lib/db"));
    keys = await import("@/server/dal/api-keys");
    errors = await import("@/server/dal/errors");
    for (const a of [owner, editor, viewer]) {
      await prisma.user.create({
        data: { id: a.userId, name: a.name, email: a.email, role: a.role, onboardedAt: new Date() },
      });
    }
  });

  afterAll(async () => {
    const ids = [ownerId, editorId, viewerId];
    await prisma.apiKey.deleteMany({ where: { userId: { in: ids } } });
    await prisma.auditEvent.deleteMany({ where: { actorId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  });

  it("creates a key shown once, authenticates it as an api-key actor and lists it hashed", async () => {
    const { key, dto } = await keys.createApiKey(editor, {
      name: "accounting script",
      scopes: ["invoices:read", "invoices:create"],
      expiresInDays: 90,
    });
    expect(key).toMatch(/^okv_[A-Za-z0-9_-]{43}$/);
    expect(dto.prefix).toBe(key.slice(0, 12));
    expect(dto.scopes).toEqual(["invoices:read", "invoices:create"]);
    expect(dto.expiresAt).not.toBeNull();
    const row = await prisma.apiKey.findUnique({ where: { id: dto.id } });
    expect(row?.keyHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(row)).not.toContain(key);

    const auth = await keys.authenticateApiKey(key);
    expect(auth).not.toBeNull();
    expect(auth?.actor).toMatchObject({
      userId: editorId,
      role: "EDITOR",
      via: "api-key",
      apiKeyId: dto.id,
      apiKeyName: "accounting script",
    });
    expect(auth?.scopes).toEqual(["invoices:read", "invoices:create"]);
    const listed = await keys.listApiKeys(editor);
    expect(listed.map((k) => k.id)).toContain(dto.id);
    // owners see it too; the viewer does not
    expect((await keys.listApiKeys(owner)).map((k) => k.id)).toContain(dto.id);
    expect((await keys.listApiKeys(viewer)).map((k) => k.id)).not.toContain(dto.id);
    const events = await prisma.auditEvent.findMany({ where: { entityId: dto.id } });
    expect(events.map((e) => e.action)).toContain("api_key.created");
    expect(JSON.stringify(events)).not.toContain(key);
  });

  it("revoked and expired keys no longer authenticate; unknown strings never do", async () => {
    const { key, dto } = await keys.createApiKey(owner, { name: "temp", scopes: ["status:read"] });
    expect(await keys.authenticateApiKey(key)).not.toBeNull();
    await keys.revokeApiKey(owner, dto.id);
    expect(await keys.authenticateApiKey(key)).toBeNull();
    await keys.revokeApiKey(owner, dto.id); // idempotent

    const expiring = await keys.createApiKey(owner, {
      name: "expiring",
      scopes: ["status:read"],
      expiresInDays: 30,
    });
    await prisma.apiKey.update({
      where: { id: expiring.dto.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect(await keys.authenticateApiKey(expiring.key)).toBeNull();
    expect(await keys.authenticateApiKey("okv_" + "a".repeat(43))).toBeNull();
    expect(await keys.authenticateApiKey("not-a-key")).toBeNull();
  });

  it("a viewer cannot grant write scopes, and an editor's key shrinks when the editor is demoted", async () => {
    await expect(
      keys.createApiKey(viewer, { name: "too much", scopes: ["invoices:create"] }),
    ).rejects.toBeInstanceOf(errors.ForbiddenError);
    const ok = await keys.createApiKey(viewer, {
      name: "reads",
      scopes: ["invoices:read", "status:read"],
    });
    expect(ok.dto.scopes).toEqual(["invoices:read", "status:read"]);

    const { key } = await keys.createApiKey(editor, {
      name: "will shrink",
      scopes: ["invoices:read", "invoices:create", "credit_notes:create"],
    });
    await prisma.user.update({ where: { id: editorId }, data: { role: "VIEWER" } });
    const auth = await keys.authenticateApiKey(key);
    expect(auth?.actor.role).toBe("VIEWER");
    expect(auth?.scopes).toEqual(["invoices:read"]);
    await prisma.user.update({ where: { id: editorId }, data: { role: "EDITOR" } });
  });

  it("a deactivated user's keys stop working and a non-owner cannot revoke another's key", async () => {
    const { key, dto } = await keys.createApiKey(editor, { name: "mine", scopes: ["status:read"] });
    await expect(keys.revokeApiKey(viewer, dto.id)).rejects.toBeInstanceOf(errors.ForbiddenError);
    await prisma.user.update({ where: { id: editorId }, data: { deactivatedAt: new Date() } });
    expect(await keys.authenticateApiKey(key)).toBeNull();
    await prisma.user.update({ where: { id: editorId }, data: { deactivatedAt: null } });
    expect(await keys.authenticateApiKey(key)).not.toBeNull();
  });
});
