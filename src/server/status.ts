import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { storage } from "@/lib/storage";
import { APP_VERSION } from "@/lib/version";
import { readBackupStatus, type BackupStatusView } from "./backup-status";
import { resolveSmtp } from "./dal/smtp-settings";

/**
 * Settings → Status and /api/health/status (spec §6.5): one report of what this instance is
 * running and whether its parts answer. Every probe is injectable so the aggregation is unit
 * tested without a database; the integration test runs the real ones.
 */
export type Health = "ok" | "warning" | "failed" | "n/a";

export interface StatusReport {
  overall: "ok" | "degraded" | "failed";
  checkedAt: string;
  version: { app: string; sha: string | null; builtAt: string | null; node: string };
  uptimeSeconds: number;
  db: {
    health: Health;
    latencyMs: number | null;
    lastMigration: { name: string; finishedAt: string } | null;
    /** Migration rows that started but never finished (a failed deploy). */
    pending: number;
    error?: string;
  };
  storage: { health: Health; driver: "local" | "s3"; latencyMs: number | null; error?: string };
  rateLimitStore: "memory" | "postgres";
  smtp: {
    health: Health;
    configured: boolean;
    source: "settings" | "env" | null;
    lastTestAt: string | null;
  };
  backups: { health: Health; view: BackupStatusView };
  email24h: { sent: number; failed: number };
}

export interface StatusProbes {
  now: () => Date;
  uptimeSeconds: () => number;
  db: () => Promise<{
    latencyMs: number;
    lastMigration: { name: string; finishedAt: string } | null;
    pending: number;
  }>;
  storage: () => Promise<{ latencyMs: number }>;
  smtp: () => Promise<{
    configured: boolean;
    source: "settings" | "env" | null;
    lastTestAt: string | null;
  }>;
  backups: () => Promise<BackupStatusView>;
  email24h: () => Promise<{ sent: number; failed: number }>;
  /** Static facts from the environment, injectable so unit tests need no env. */
  facts: () => {
    sha: string | null;
    builtAt: string | null;
    storageDriver: "local" | "s3";
    rateLimitStore: "memory" | "postgres";
  };
}

const BACKUP_STALE_HOURS = 36;

async function timed<T>(fn: () => Promise<T>): Promise<T & { latencyMs: number }> {
  const start = process.hrtime.bigint();
  const out = await fn();
  const latencyMs = Number(process.hrtime.bigint() - start) / 1e6;
  return { ...out, latencyMs: Math.round(latencyMs * 10) / 10 };
}

/** The real probes; each is replaceable in tests. */
export const defaultProbes: StatusProbes = {
  now: () => new Date(),
  uptimeSeconds: () => Math.round(process.uptime()),
  db: () =>
    timed(async () => {
      const rows = await prisma.$queryRaw<
        { migration_name: string; finished_at: Date | null }[]
      >`SELECT migration_name, finished_at FROM "_prisma_migrations" WHERE rolled_back_at IS NULL ORDER BY started_at DESC`;
      const finished = rows.find((r) => r.finished_at !== null);
      return {
        lastMigration: finished
          ? { name: finished.migration_name, finishedAt: finished.finished_at!.toISOString() }
          : null,
        pending: rows.filter((r) => r.finished_at === null).length,
      };
    }),
  storage: () =>
    timed(async () => {
      const key = `probes/${randomUUID()}.txt`;
      const body = Buffer.from("okinvo status probe");
      await storage.put(key, body, { contentType: "text/plain", byteSize: body.length });
      try {
        const got = await storage.get(key);
        const chunks: Buffer[] = [];
        for await (const c of got.stream) chunks.push(Buffer.from(c as Uint8Array));
        if (Buffer.concat(chunks).toString() !== body.toString())
          throw new Error("probe read back differs");
      } finally {
        await storage.delete(key).catch(() => undefined);
      }
      return {};
    }),
  smtp: async () => {
    const smtp = await resolveSmtp();
    const last = await prisma.auditEvent.findFirst({
      where: { action: "email.test_sent" },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    return {
      configured: smtp !== null,
      source: smtp?.source ?? null,
      lastTestAt: last?.createdAt.toISOString() ?? null,
    };
  },
  backups: readBackupStatus,
  facts: () => ({
    sha: env.OKINVO_BUILD_SHA ?? null,
    builtAt: env.OKINVO_BUILD_DATE ?? null,
    storageDriver: env.STORAGE_DRIVER,
    rateLimitStore: env.RATE_LIMIT_STORE,
  }),
  email24h: async () => {
    const since = new Date(Date.now() - 24 * 3600 * 1000);
    const [sent, failed] = await Promise.all([
      prisma.emailMessage.count({ where: { createdAt: { gte: since }, status: "SENT" } }),
      prisma.emailMessage.count({ where: { createdAt: { gte: since }, status: "FAILED" } }),
    ]);
    return { sent, failed };
  },
};

function message(e: unknown): string {
  return e instanceof Error ? e.message.slice(0, 300) : String(e).slice(0, 300);
}

export function backupHealth(view: BackupStatusView, now: Date): Health {
  if (!view.configured) return "n/a";
  if (view.problem) return "warning";
  if (!view.status) return "warning"; // wired, never ran
  if (!view.status.ok) return "failed";
  const ageHours = (now.getTime() - new Date(view.status.finishedAt).getTime()) / 3_600_000;
  return ageHours > BACKUP_STALE_HOURS ? "warning" : "ok";
}

export async function collectStatus(probes: Partial<StatusProbes> = {}): Promise<StatusReport> {
  const p = { ...defaultProbes, ...probes };
  const now = p.now();
  const facts = p.facts();
  const [db, storageResult, smtp, backupsView, email24h] = await Promise.all([
    p.db().then(
      (r) => ({ ok: true as const, ...r }),
      (e: unknown) => ({ ok: false as const, error: message(e) }),
    ),
    p.storage().then(
      (r) => ({ ok: true as const, ...r }),
      (e: unknown) => ({ ok: false as const, error: message(e) }),
    ),
    p.smtp().catch(() => ({ configured: false, source: null, lastTestAt: null })),
    p.backups().catch((e: unknown) => ({ configured: true, status: null, problem: message(e) })),
    p.email24h().catch(() => ({ sent: 0, failed: 0 })),
  ]);

  const dbHealth: Health = !db.ok ? "failed" : db.pending > 0 ? "warning" : "ok";
  const storageHealth: Health = storageResult.ok ? "ok" : "failed";
  const smtpHealth: Health = smtp.configured ? "ok" : "n/a";
  const backups = backupHealth(backupsView, now);
  const healths = [dbHealth, storageHealth, backups];
  const overall = healths.includes("failed")
    ? "failed"
    : healths.includes("warning") || (email24h.failed > 0 && email24h.sent === 0)
      ? "degraded"
      : "ok";

  return {
    overall,
    checkedAt: now.toISOString(),
    version: {
      app: APP_VERSION,
      sha: facts.sha,
      builtAt: facts.builtAt,
      node: process.version,
    },
    uptimeSeconds: p.uptimeSeconds(),
    db: db.ok
      ? {
          health: dbHealth,
          latencyMs: db.latencyMs,
          lastMigration: db.lastMigration,
          pending: db.pending,
        }
      : { health: "failed", latencyMs: null, lastMigration: null, pending: 0, error: db.error },
    storage: storageResult.ok
      ? { health: storageHealth, driver: facts.storageDriver, latencyMs: storageResult.latencyMs }
      : {
          health: "failed",
          driver: facts.storageDriver,
          latencyMs: null,
          error: storageResult.error,
        },
    rateLimitStore: facts.rateLimitStore,
    smtp: { health: smtpHealth, ...smtp },
    backups: { health: backups, view: backupsView },
    email24h,
  };
}
