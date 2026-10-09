import "dotenv/config";
import { afterAll, describe, expect, it } from "vitest";
import type { Actor } from "@/server/actor";

const url = process.env.DATABASE_URL;
if (!url && process.env.CI) throw new Error("DATABASE_URL is required when CI is set");

const actor: Actor = {
  userId: "no-such-user",
  email: "a@example.com",
  name: "A",
  role: "OWNER",
  timezone: "UTC",
  locale: "en-US",
  ip: "203.0.113.1",
  userAgent: "vitest",
};

describe.skipIf(!url)("audit()", () => {
  const entityId = `audit-${Date.now()}`;
  let prisma: typeof import("@/lib/db").prisma;

  afterAll(async () => {
    await prisma.auditEvent.deleteMany({ where: { entityId } });
  });

  it("writes an event in the caller's transaction with redacted diffs and request context", async () => {
    ({ prisma } = await import("@/lib/db"));
    const { audit } = await import("@/server/dal/audit");
    await prisma.$transaction(async (tx) => {
      await audit(tx, actor, "client.updated", "Client", entityId, {
        summary: "Renamed",
        before: { name: "Old", detailsEnc: "v1.secret" },
        after: { name: "New", detailsEnc: "v1.other" },
      });
    });
    const row = await prisma.auditEvent.findFirstOrThrow({ where: { entityId } });
    // An actor id that is not a user row must not break auditing (FK is nullable + SetNull).
    expect(row.actorId).toBeNull();
    expect(row.action).toBe("client.updated");
    expect(row.summary).toBe("Renamed");
    expect(row.before).toEqual({ name: "Old", detailsEnc: "[redacted]" });
    expect(row.after).toEqual({ name: "New", detailsEnc: "[redacted]" });
    expect(row.ipAddress).toBe("203.0.113.1");
    expect(row.userAgent).toBe("vitest");
  });

  it("rolls back with the transaction", async () => {
    const { audit } = await import("@/server/dal/audit");
    await expect(
      prisma.$transaction(async (tx) => {
        await audit(tx, actor, "client.created", "Client", `${entityId}-rb`);
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(await prisma.auditEvent.count({ where: { entityId: `${entityId}-rb` } })).toBe(0);
  });
});
