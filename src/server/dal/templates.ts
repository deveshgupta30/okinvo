import "server-only";
import type { Tx } from "@/lib/db";
import {
  DEFAULT_TEMPLATE_CONFIG,
  TemplateConfigSchema,
  mergeTemplateConfig,
  type TemplateConfig,
} from "@/lib/schemas";
import { getSetting } from "./settings";

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
