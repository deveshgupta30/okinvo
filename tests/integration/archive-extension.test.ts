import "dotenv/config";
import { afterAll, describe, expect, it } from "vitest";

const url = process.env.DATABASE_URL;
if (!url && process.env.CI) throw new Error("DATABASE_URL is required when CI is set");

describe.skipIf(!url)("archive filter extension", () => {
  const tag = `archive-ext-${Date.now()}`;
  let prisma: typeof import("@/lib/db").prisma;

  afterAll(async () => {
    await prisma.client.deleteMany({ where: { notes: tag } });
  });

  it("hides archived rows from findMany/findFirst/count unless asked for", async () => {
    ({ prisma } = await import("@/lib/db"));
    const base = { billingAddress: {}, countryCode: "IN", currency: "INR", notes: tag };
    const live = await prisma.client.create({ data: { ...base, displayName: `${tag} live` } });
    const gone = await prisma.client.create({
      data: { ...base, displayName: `${tag} archived`, archivedAt: new Date() },
    });

    const names = (rows: { id: string }[]) => rows.map((r) => r.id).sort();
    expect(names(await prisma.client.findMany({ where: { notes: tag } }))).toEqual([live.id]);
    expect(await prisma.client.count({ where: { notes: tag } })).toBe(1);
    expect(await prisma.client.findFirst({ where: { id: gone.id } })).toBeNull();

    // Explicit archivedAt wins: {} means "either".
    expect(names(await prisma.client.findMany({ where: { notes: tag, archivedAt: {} } }))).toEqual(
      [live.id, gone.id].sort(),
    );
    expect(
      names(await prisma.client.findMany({ where: { notes: tag, archivedAt: { not: null } } })),
    ).toEqual([gone.id]);
    // Lookups by id are never filtered: editing an archived record must still work.
    expect((await prisma.client.findUnique({ where: { id: gone.id } }))?.id).toBe(gone.id);
  });

  it("applies inside interactive transactions too", async () => {
    const count = await prisma.$transaction((tx) => tx.client.count({ where: { notes: tag } }));
    expect(count).toBe(1);
  });
});
