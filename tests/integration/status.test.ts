import "dotenv/config";
import { describe, expect, it } from "vitest";

/** The real probes (spec §6.5): database and local storage answer, no unfinished migrations. */
const url = process.env.DATABASE_URL;
if (!url && process.env.CI) throw new Error("DATABASE_URL is required when CI is set");

describe.skipIf(!url)("collectStatus (real probes)", () => {
  it("reports a healthy database and storage with the last applied migration", async () => {
    process.env.FIELD_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString("base64");
    const { collectStatus } = await import("@/server/status");
    const r = await collectStatus();
    expect(r.db.health).toBe("ok");
    expect(r.db.pending).toBe(0);
    expect(r.db.latencyMs).toBeGreaterThan(0);
    expect(r.db.lastMigration?.name).toMatch(/^\d{14}_/);
    expect(r.storage.health).toBe("ok");
    expect(r.storage.latencyMs).toBeGreaterThan(0);
    expect(["ok", "degraded"]).toContain(r.overall);
    expect(r.email24h.sent).toBeGreaterThanOrEqual(0);
  }, 30_000);
});
