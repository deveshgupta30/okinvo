import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { prisma, type Tx } from "@/lib/db";
import {
  DEFAULT_TEMPLATE_CONFIG,
  TemplateConfigSchema,
  mergeTemplateConfig,
  type TemplateConfig,
} from "@/lib/schemas";
import type { Actor } from "@/server/actor";
import { audit } from "./audit";
import { diffForAudit } from "./audit-redact";
import { InvariantError, NotFoundError } from "./errors";
import { requireWriter } from "./authz";
import { deleteSetting, getSetting, putSetting } from "./settings";

/**
 * Resolution order at render/issue (v2 §12.2): the issuer's override, then the instance setting,
 * then the built-in default. The result is frozen into `templateSnapshot` when a document issues.
 */
export async function resolveTemplateConfig(
  tx: Tx,
  issuerProfileId: string | null,
): Promise<TemplateConfig> {
  if (issuerProfileId) {
    const profile = await tx.issuerProfile.findUnique({
      where: { id: issuerProfileId },
      select: { templateConfigOverride: true },
    });
    if (profile?.templateConfigOverride) return mergeTemplateConfig(profile.templateConfigOverride);
  }
  const setting = await getSetting(tx, "documentTemplate", TemplateConfigSchema);
  return setting ? mergeTemplateConfig(setting) : DEFAULT_TEMPLATE_CONFIG;
}

export interface TemplateSettings {
  config: TemplateConfig;
  source: "setting" | "default";
  /** Profiles that opted into their own template. */
  overrides: { profileId: string; label: string; templateId: TemplateConfig["templateId"] }[];
}

export async function getTemplateSettings(_actor: Actor): Promise<TemplateSettings> {
  const setting = await getSetting(prisma, "documentTemplate", TemplateConfigSchema);
  const profiles = await prisma.issuerProfile.findMany({
    where: { templateConfigOverride: { not: Prisma.DbNull } },
    select: { id: true, label: true, templateConfigOverride: true },
    orderBy: { label: "asc" },
  });
  return {
    config: setting ? mergeTemplateConfig(setting) : DEFAULT_TEMPLATE_CONFIG,
    source: setting ? "setting" : "default",
    overrides: profiles.map((p) => ({
      profileId: p.id,
      label: p.label,
      templateId: mergeTemplateConfig(p.templateConfigOverride).templateId,
    })),
  };
}

/** Settings → Templates save (SPEC §4.17): validated, audited, applies to future documents only. */
export async function saveTemplateConfig(actor: Actor, input: unknown): Promise<TemplateConfig> {
  requireWriter(actor);
  const config = mergeTemplateConfig(input);
  return prisma.$transaction((tx) =>
    putSetting(tx, actor, "documentTemplate", config, TemplateConfigSchema),
  );
}

export async function resetTemplateConfig(actor: Actor): Promise<void> {
  requireWriter(actor);
  await prisma.$transaction((tx) => deleteSetting(tx, actor, "documentTemplate"));
}

/** Import from the JSON the Export button produced; partial files merge over the defaults. */
export async function importTemplateConfig(actor: Actor, json: string): Promise<TemplateConfig> {
  requireWriter(actor);
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new InvariantError("That file is not valid JSON.", { json: ["not valid JSON"] });
  }
  let config: TemplateConfig;
  try {
    config = mergeTemplateConfig(parsed);
  } catch (e) {
    throw new InvariantError(`The template file is invalid: ${(e as Error).message}`, {
      json: ["invalid template configuration"],
    });
  }
  return saveTemplateConfig(actor, config);
}

/** Per-profile override; `null` returns the profile to the instance-wide template. */
export async function saveProfileTemplateOverride(
  actor: Actor,
  profileId: string,
  input: unknown | null,
): Promise<TemplateConfig | null> {
  requireWriter(actor);
  const config = input === null ? null : mergeTemplateConfig(input);
  return prisma.$transaction(async (tx) => {
    const before = await tx.issuerProfile.findUnique({
      where: { id: profileId },
      select: { label: true, templateConfigOverride: true },
    });
    if (!before) throw new NotFoundError("Issuer profile", profileId);
    await tx.issuerProfile.update({
      where: { id: profileId },
      data: {
        templateConfigOverride: config
          ? (JSON.parse(JSON.stringify(config)) as Prisma.InputJsonValue)
          : Prisma.DbNull,
      },
    });
    const diff = diffForAudit(
      { templateConfigOverride: before.templateConfigOverride },
      { templateConfigOverride: config },
    );
    await audit(tx, actor, "profile.template_override", "IssuerProfile", profileId, {
      summary: config
        ? `${before.label} now uses its own ${config.templateId} template`
        : `${before.label} uses the instance template again`,
      before: diff.before,
      after: diff.after,
    });
    return config;
  });
}
