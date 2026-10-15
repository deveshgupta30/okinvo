import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Local, cookie-less analytics (addendum §2 item 19): one row per path per day, a counter and
 * nothing else; the 30-day view reads them back newest first.
 */
const url = process.env.DATABASE_URL;
if (!url && process.env.CI) throw new Error("DATABASE_URL is required when CI is set");

const tag = `/usage-test-${Date.now()}`;

describe.skipIf(!url)("usage DAL", () => {
  let prisma: typeof import("@/lib/db").prisma;
  let usage: typeof import("@/server/dal/usage");

  beforeAll(async () => {
    process.env.FIELD_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString("base64");
    process.env.APP_URL ??= "http://127.0.0.1:3000";
    ({ prisma } = await import("@/lib/db"));
    usage = await import("@/server/dal/usage");
  });

  afterAll(async () => {
    await prisma.pageView.deleteMany({ where: { path: { startsWith: tag } } });
  });

  it("counts two views of the same path on the same day as one row with count 2", async () => {
    await usage.recordPageView(`${tag}/a`, "2026-10-14");
    await usage.recordPageView(`${tag}/a`, "2026-10-14");
    const row = await prisma.pageView.findUnique({
      where: { day_path: { day: "2026-10-14", path: `${tag}/a` } },
    });
    expect(row?.count).toBe(2);
  });

  it("starts a new row on another day", async () => {
    await usage.recordPageView(`${tag}/a`, "2026-10-15");
    const rows = await prisma.pageView.findMany({ where: { path: `${tag}/a` } });
    expect(rows.map((r) => [r.day, r.count]).sort()).toEqual([
      ["2026-10-14", 2],
      ["2026-10-15", 1],
    ]);
  });

  it("normalises ids out of the path and ignores query strings", async () => {
    await usage.recordPageView(
      `${tag}/invoices/01a13c40-55d5-705e-8dc0-7c3a9e928d45?x=1`,
      "2026-10-15",
    );
    const row = await prisma.pageView.findFirst({ where: { path: `${tag}/invoices/:id` } });
    expect(row?.count).toBe(1);
  });

  it("lists the last 30 days newest first and leaves older rows out", async () => {
    await usage.recordPageView(`${tag}/old`, "2026-08-01");
    const rows = await usage.usageLast30Days("2026-10-15");
    const mine = rows.filter((r) => r.path.startsWith(tag));
    expect(mine[0]?.day).toBe("2026-10-15");
    expect(mine.some((r) => r.path === `${tag}/old`)).toBe(false);
    expect(mine.find((r) => r.day === "2026-10-14" && r.path === `${tag}/a`)?.count).toBe(2);
  });

  it("stores no user, address or agent: day, path and count only", () => {
    const fields = Object.keys(prisma.pageView.fields);
    expect(fields.sort()).toEqual(["count", "day", "path"]);
  });
});
