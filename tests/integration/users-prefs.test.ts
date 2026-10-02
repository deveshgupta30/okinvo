import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Actor } from "@/server/actor";

/**
 * User preference columns (spec §4.1): accent, country, currency, locale, usage, onboarding
 * and avatar live on the User row, are read through getAccount and written through audited
 * DAL functions — never through Better Auth's update-user route.
 */
const url = process.env.DATABASE_URL;
if (!url && process.env.CI) throw new Error("DATABASE_URL is required when CI is set");

describe.skipIf(!url)("user preferences DAL", () => {
  const id = `prefs-${Date.now()}`;
  const actor: Actor = {
    userId: id,
    email: `${id}@example.com`,
    name: "Prefs",
    role: "OWNER",
    timezone: "UTC",
  };
  let prisma: typeof import("@/lib/db").prisma;
  let users: typeof import("@/server/dal/users");
  let errors: typeof import("@/server/dal/errors");
  let assetId: string;

  beforeAll(async () => {
    ({ prisma } = await import("@/lib/db"));
    users = await import("@/server/dal/users");
    errors = await import("@/server/dal/errors");
    await prisma.user.create({ data: { id, name: "Prefs", email: actor.email } });
    const asset = await prisma.asset.create({
      data: {
        kind: "AVATAR",
        storageKey: `assets/avatar/2026/${id}.png`,
        contentType: "image/png",
        byteSize: 10,
        width: 512,
        height: 512,
        sha256: "0".repeat(64),
        createdById: id,
      },
    });
    assetId = asset.id;
  });

  afterAll(async () => {
    await prisma.auditEvent.deleteMany({ where: { entityId: id } });
    await prisma.user.deleteMany({ where: { id } });
    await prisma.asset.deleteMany({ where: { id: assetId } });
  });

  it("starts with the defaults: mint accent, en-US locale, not onboarded, no avatar", async () => {
    const account = await users.getAccount(actor);
    expect(account).toMatchObject({
      accent: "mint",
      locale: "en-US",
      countryCode: null,
      currency: null,
      usage: null,
      onboardedAt: null,
      avatarKey: null,
    });
  });

  it("setAccent and setTheme persist and audit", async () => {
    await users.setAccent(actor, "rose");
    await users.setTheme(actor, "light");
    const account = await users.getAccount(actor);
    expect(account.accent).toBe("rose");
    expect(account.theme).toBe("light");
    const events = await prisma.auditEvent.findMany({
      where: { entityId: id, action: "account.updated" },
      orderBy: { createdAt: "asc" },
    });
    expect(events.map((e) => e.after)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ accent: "rose" }),
        expect.objectContaining({ theme: "light" }),
      ]),
    );
  });

  it("updateAccount stores region and language preferences", async () => {
    const updated = await users.updateAccount(actor, {
      name: "Prefs",
      timezone: "Europe/London",
      theme: "light",
      locale: "de",
      countryCode: "GB",
      currency: "GBP",
    });
    expect(updated).toMatchObject({ locale: "de", countryCode: "GB", currency: "GBP" });
  });

  it("setAvatar links an AVATAR asset, refuses unknown ids, and clears", async () => {
    await expect(users.setAvatar(actor, "no-such-asset")).rejects.toBeInstanceOf(
      errors.NotFoundError,
    );
    await users.setAvatar(actor, assetId);
    expect((await users.getAccount(actor)).avatarKey).toBe(`assets/avatar/2026/${id}.png`);
    const event = await prisma.auditEvent.findFirstOrThrow({
      where: { entityId: id, action: "account.avatar" },
    });
    expect(event.after).toMatchObject({ avatarAssetId: assetId });
    await users.setAvatar(actor, null);
    expect((await users.getAccount(actor)).avatarKey).toBeNull();
  });
});
