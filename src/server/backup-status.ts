import "server-only";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import { env } from "@/lib/env";

/** `last-backup.json`, written by `docker/backup/backup.sh` after every run. */
export const BackupStatusSchema = z.object({
  ok: z.boolean(),
  startedAt: z.string(),
  finishedAt: z.string(),
  pgDump: z.string().nullable(),
  storageArchive: z.string().nullable(),
  sizeBytes: z.number().int().nonnegative().nullable(),
  retentionDays: z.number().int().nonnegative().nullable(),
  error: z.string().nullable(),
});
export type BackupStatus = z.infer<typeof BackupStatusSchema>;

export interface BackupStatusView {
  /** False when `BACKUP_STATUS_FILE` is unset (no backup service wired). */
  configured: boolean;
  /** Null when the file does not exist yet (service wired, no run so far) or cannot be parsed. */
  status: BackupStatus | null;
  problem: string | null;
}

export async function readBackupStatus(): Promise<BackupStatusView> {
  const path = env.BACKUP_STATUS_FILE;
  if (!path) return { configured: false, status: null, problem: null };
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    return {
      configured: true,
      status: null,
      problem: code === "ENOENT" ? null : `Cannot read ${path} (${code ?? "error"})`,
    };
  }
  try {
    return { configured: true, status: BackupStatusSchema.parse(JSON.parse(raw)), problem: null };
  } catch {
    return { configured: true, status: null, problem: `${path} is not a valid status file` };
  }
}
