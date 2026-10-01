import "server-only";
import type { z } from "zod";
import type { Tx } from "@/lib/db";
import type { Actor } from "@/server/actor";
import { audit } from "./audit";
import { diffForAudit } from "./audit-redact";

export type SettingKey = "documentTemplate" | "smtp" | "emailDefaults";

/** Typed read of an AppSetting row; null when unset or when the stored value no longer parses. */
export async function getSetting<T>(
  tx: Tx,
  key: SettingKey,
  schema: z.ZodType<T>,
): Promise<T | null> {
  const row = await tx.appSetting.findUnique({ where: { key } });
  if (!row) return null;
  const parsed = schema.safeParse(row.value);
  return parsed.success ? parsed.data : null;
}

export async function putSetting<T>(
  tx: Tx,
  actor: Actor,
  key: SettingKey,
  value: unknown,
  schema: z.ZodType<T>,
): Promise<T> {
  const data = schema.parse(value);
  const json = JSON.parse(JSON.stringify(data)) as object;
  const previous = await tx.appSetting.findUnique({ where: { key } });
  await tx.appSetting.upsert({
    where: { key },
    create: { key, value: json },
    update: { value: json },
  });
  const diff = diffForAudit(
    (previous?.value as Record<string, unknown> | null) ?? {},
    json as Record<string, unknown>,
  );
  await audit(tx, actor, "settings.updated", "AppSetting", key, {
    summary: `Updated ${key}`,
    before: diff.before,
    after: diff.after,
  });
  return data;
}

export async function deleteSetting(tx: Tx, actor: Actor, key: SettingKey): Promise<void> {
  const previous = await tx.appSetting.findUnique({ where: { key } });
  if (!previous) return;
  await tx.appSetting.delete({ where: { key } });
  await audit(tx, actor, "settings.cleared", "AppSetting", key, {
    summary: `Cleared ${key}`,
    before: previous.value,
  });
}
