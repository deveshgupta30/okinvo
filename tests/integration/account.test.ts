import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Actor } from "@/server/actor";

const url = process.env.DATABASE_URL;
if (!url && process.env.CI) throw new Error("DATABASE_URL is required when CI is set");

describe.skipIf(!url)("account settings DAL", () => {
  const id = `acct-${Date.now()}`;
  const actor: Actor = {
    userId: id,
    email: `${id}@example.com`,
    name: "Before",
    role: "OWNER",
    timezone: "UTC",
  };
  let prisma: typeof import("@/lib/db").prisma;
  let users: typeof import("@/server/dal/users");

  beforeAll(async () => {
    ({ prisma } = await import("@/lib/db"));
    users = await import("@/server/dal/users");
    await prisma.user.create({ data: { id, name: "Before", email: actor.email } });
  });

  afterAll(async () => {
    await prisma.auditEvent.deleteMany({ where: { entityId: id } });
    await prisma.user.deleteMany({ where: { id } });
  });

  it("updates name, timezone and theme and audits the change", async () => {
    const updated = await users.updateAccount(actor, {
      name: "After",
      timezone: "Asia/Kolkata",
      theme: "light",
    });
    expect(updated).toMatchObject({ name: "After", timezone: "Asia/Kolkata", theme: "light" });
    const row = await prisma.user.findUniqueOrThrow({ where: { id } });
    expect(row.timezone).toBe("Asia/Kolkata");
    expect(row.theme).toBe("light");
    const event = await prisma.auditEvent.findFirstOrThrow({
      where: { entityId: id, action: "account.updated" },
    });
    expect(event.before).toMatchObject({ name: "Before" });
    expect(event.after).toMatchObject({ name: "After", timezone: "Asia/Kolkata" });
  });

  it("reads the account back with a system theme default", async () => {
    await prisma.user.update({ where: { id }, data: { theme: null } });
    const account = await users.getAccount(actor);
    expect(account.theme).toBe("system");
    expect(account.timezone).toBe("Asia/Kolkata");
  });
});
