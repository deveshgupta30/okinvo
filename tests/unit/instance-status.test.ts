import { describe, expect, it } from "vitest";
import { backupHealth, collectStatus, type StatusProbes } from "@/server/status";

/** Status aggregation (spec §6.5) with injected probes — no database, no storage. */
const now = new Date("2026-10-03T10:00:00Z");

const healthy: StatusProbes = {
  now: () => now,
  uptimeSeconds: () => 3_700,
  db: async () => ({
    latencyMs: 2.5,
    lastMigration: { name: "20261003080000_share_links", finishedAt: "2026-10-03T00:00:00Z" },
    pending: 0,
  }),
  storage: async () => ({ latencyMs: 4 }),
  smtp: async () => ({ configured: true, source: "settings", lastTestAt: "2026-10-02T09:00:00Z" }),
  backups: async () => ({
    configured: true,
    problem: null,
    status: {
      ok: true,
      startedAt: "2026-10-03T02:00:00Z",
      finishedAt: "2026-10-03T02:05:00Z",
      pgDump: "db.sql.gz",
      storageArchive: "storage.tar.gz",
      sizeBytes: 1024,
      retentionDays: 30,
      error: null,
    },
  }),
  email24h: async () => ({ sent: 3, failed: 0 }),
  facts: () => ({
    sha: "abc123",
    builtAt: "2026-10-03T01:00:00Z",
    storageDriver: "local",
    rateLimitStore: "memory",
  }),
};

describe("collectStatus", () => {
  it("is ok when every probe answers", async () => {
    const r = await collectStatus(healthy);
    expect(r.overall).toBe("ok");
    expect(r.db).toMatchObject({ health: "ok", latencyMs: 2.5, pending: 0 });
    expect(r.storage.health).toBe("ok");
    expect(r.smtp).toMatchObject({ health: "ok", configured: true, source: "settings" });
    expect(r.backups.health).toBe("ok");
    expect(r.uptimeSeconds).toBe(3_700);
    expect(r.checkedAt).toBe(now.toISOString());
    expect(r.version.app).toMatch(/^\d+\.\d+\.\d+/);
    expect(r.version.node).toBe(process.version);
  });

  it("a failing storage probe makes the report failed and keeps the error", async () => {
    const r = await collectStatus({
      ...healthy,
      storage: async () => {
        throw new Error("EACCES: permission denied, open '/data/storage/probes'");
      },
    });
    expect(r.overall).toBe("failed");
    expect(r.storage.health).toBe("failed");
    expect(r.storage.error).toMatch(/EACCES/);
    expect(r.db.health).toBe("ok");
  });

  it("unfinished migrations and stale or failed backups degrade the report", async () => {
    const pending = await collectStatus({
      ...healthy,
      db: async () => ({ ...(await healthy.db()), pending: 1 }),
    });
    expect(pending.overall).toBe("degraded");
    expect(pending.db.health).toBe("warning");

    const stale = await collectStatus({
      ...healthy,
      backups: async () => {
        const v = await healthy.backups();
        return { ...v, status: { ...v.status!, finishedAt: "2026-09-30T02:05:00Z" } };
      },
    });
    expect(stale.backups.health).toBe("warning");
    expect(stale.overall).toBe("degraded");

    const failedRun = await collectStatus({
      ...healthy,
      backups: async () => {
        const v = await healthy.backups();
        return { ...v, status: { ...v.status!, ok: false, error: "pg_dump: connection refused" } };
      },
    });
    expect(failedRun.backups.health).toBe("failed");
    expect(failedRun.overall).toBe("failed");
  });

  it("treats no SMTP and no backup service as not configured, not as failures", async () => {
    const r = await collectStatus({
      ...healthy,
      smtp: async () => ({ configured: false, source: null, lastTestAt: null }),
      backups: async () => ({ configured: false, status: null, problem: null }),
    });
    expect(r.overall).toBe("ok");
    expect(r.smtp.health).toBe("n/a");
    expect(r.backups.health).toBe("n/a");
  });

  it("a database error never throws out of the report", async () => {
    const r = await collectStatus({
      ...healthy,
      db: async () => {
        throw new Error("connect ECONNREFUSED 127.0.0.1:5432");
      },
    });
    expect(r.overall).toBe("failed");
    expect(r.db).toMatchObject({ health: "failed", latencyMs: null, pending: 0 });
    expect(r.db.error).toMatch(/ECONNREFUSED/);
  });
});

describe("backupHealth", () => {
  it("grades the backup view", async () => {
    const view = await healthy.backups();
    expect(backupHealth(view, now)).toBe("ok");
    expect(backupHealth({ configured: false, status: null, problem: null }, now)).toBe("n/a");
    expect(backupHealth({ configured: true, status: null, problem: null }, now)).toBe("warning");
    expect(backupHealth({ configured: true, status: null, problem: "bad file" }, now)).toBe(
      "warning",
    );
  });
});
