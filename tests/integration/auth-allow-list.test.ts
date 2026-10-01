import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.DATABASE_URL;
if (!url && process.env.CI) throw new Error("DATABASE_URL is required when CI is set");

// The hook must reject before any row exists, so these tests talk to a real database.
describe.skipIf(!url)("allow-list enforcement at user creation", () => {
  const allowed = `allowed-${Date.now()}@allowed.example`;
  const blocked = `blocked-${Date.now()}@blocked.example`;
  const password = "correct horse battery staple";
  let auth: typeof import("@/server/auth-config").auth;
  let prisma: typeof import("@/lib/db").prisma;

  beforeAll(async () => {
    process.env.AUTH_PASSWORD_SIGNIN = "true";
    process.env.AUTH_ALLOWED_EMAILS = "*@allowed.example";
    process.env.APP_URL ??= "http://127.0.0.1:3000";
    ({ auth } = await import("@/server/auth-config"));
    ({ prisma } = await import("@/lib/db"));
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { in: [allowed, blocked] } } });
  });

  it("rejects an email outside the allow-list and creates nothing", async () => {
    await expect(
      auth.api.signUpEmail({ body: { email: blocked, password, name: "Blocked" } }),
    ).rejects.toMatchObject({ status: "FORBIDDEN" });
    expect(await prisma.user.count({ where: { email: blocked } })).toBe(0);
    expect(await prisma.account.count({ where: { user: { email: blocked } } })).toBe(0);
  });

  it("creates an allow-listed user as OWNER and signs them in", async () => {
    const result = await auth.api.signUpEmail({
      body: { email: allowed, password, name: "Allowed" },
    });
    expect(result.user.email).toBe(allowed);
    const row = await prisma.user.findUniqueOrThrow({ where: { email: allowed } });
    expect(row.role).toBe("OWNER");
    const signedIn = await auth.api.signInEmail({ body: { email: allowed, password } });
    expect(signedIn.user.id).toBe(row.id);
    expect(await prisma.session.count({ where: { userId: row.id } })).toBeGreaterThan(0);
  });
});
