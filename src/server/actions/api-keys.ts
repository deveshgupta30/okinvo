"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { SCOPES } from "@/lib/api/scopes";
import { fIdList, parseForm } from "@/lib/forms";
import { requireRole } from "@/server/auth";
import { createApiKey, revokeApiKey } from "@/server/dal/api-keys";
import { isDalError } from "@/server/dal/errors";
import { actionT, failedParse, str, type ActionState } from "./shared";

const PAGE = "/settings/api";

const CreateSchema = z.object({
  name: z.string().trim().min(1, "required").max(60),
  scopes: fIdList.pipe(z.array(z.enum(SCOPES)).min(1, "pick at least one scope")),
  expires: z.enum(["30", "90", "365", "never"]).default("never"),
});

export type ApiKeyState =
  | ActionState
  | { ok: true; message: string; created: { key: string; name: string; prefix: string } };

export async function createApiKeyAction(
  _prev: ApiKeyState | null,
  formData: FormData,
): Promise<ApiKeyState> {
  const actor = await requireRole("VIEWER");
  const t = await actionT();
  const parsed = parseForm(CreateSchema, formData);
  if (!parsed.ok) return failedParse(parsed, formData);
  try {
    const { key, dto } = await createApiKey(actor, {
      name: parsed.data.name,
      scopes: parsed.data.scopes,
      expiresInDays:
        parsed.data.expires === "never" ? null : (Number(parsed.data.expires) as 30 | 90 | 365),
    });
    revalidatePath(PAGE);
    return {
      ok: true,
      message: t("apiKeyCreated"),
      created: { key, name: dto.name, prefix: dto.prefix },
    };
  } catch (e) {
    if (!isDalError(e)) throw e;
    return { ok: false, fieldErrors: e.fieldErrors ?? {}, message: e.message, values: {} };
  }
}

export async function revokeApiKeyAction(formData: FormData): Promise<void> {
  const actor = await requireRole("VIEWER");
  await revokeApiKey(actor, str(formData, "id"));
  revalidatePath(PAGE);
}
