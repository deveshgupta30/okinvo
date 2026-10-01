"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { withFlash } from "@/lib/flash";
import { requireOwner } from "@/server/auth";
import { isDalError } from "@/server/dal/errors";
import {
  importTemplateConfig,
  resetTemplateConfig,
  saveProfileTemplateOverride,
  saveTemplateConfig,
} from "@/server/dal/templates";
import { errorMessage, str, type ActionState, valuesOf } from "./shared";

const PAGE = "/settings/templates";

function parseConfigJson(formData: FormData): unknown {
  const raw = str(formData, "configJson");
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("The template form sent invalid data.");
  }
}

/** Saves the instance template (scope "instance") or a profile's override (scope = profile id). */
export async function saveTemplateAction(
  scope: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireOwner();
  const target = scope === "instance" ? PAGE : `/settings/profiles/${scope}/template`;
  try {
    const config = parseConfigJson(formData);
    if (scope === "instance") await saveTemplateConfig(actor, config);
    else await saveProfileTemplateOverride(actor, scope, config);
  } catch (e) {
    if (isDalError(e)) {
      return {
        ok: false,
        fieldErrors: e.fieldErrors ?? {},
        message: e.message,
        values: valuesOf(formData),
      };
    }
    return {
      ok: false,
      fieldErrors: {},
      message: (e as Error).message,
      values: valuesOf(formData),
    };
  }
  revalidatePath(PAGE);
  revalidatePath("/settings/profiles");
  redirect(
    withFlash(target, { kind: "success", message: "Template saved; future documents use it" }),
  );
}

export async function resetTemplateAction(): Promise<void> {
  const actor = await requireOwner();
  await resetTemplateConfig(actor);
  revalidatePath(PAGE);
  redirect(withFlash(PAGE, { kind: "success", message: "Template reset to the built-in default" }));
}

export async function importTemplateAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireOwner();
  try {
    await importTemplateConfig(actor, str(formData, "json"));
  } catch (e) {
    if (isDalError(e)) {
      return {
        ok: false,
        fieldErrors: e.fieldErrors ?? {},
        message: e.message,
        values: valuesOf(formData),
      };
    }
    throw e;
  }
  revalidatePath(PAGE);
  redirect(withFlash(PAGE, { kind: "success", message: "Template imported" }));
}

export async function clearProfileTemplateAction(formData: FormData): Promise<void> {
  const actor = await requireOwner();
  const profileId = str(formData, "profileId");
  try {
    await saveProfileTemplateOverride(actor, profileId, null);
  } catch (e) {
    redirect(
      withFlash(`/settings/profiles/${profileId}/template`, {
        kind: "error",
        message: errorMessage(e),
      }),
    );
  }
  revalidatePath(PAGE);
  redirect(
    withFlash(`/settings/profiles/${profileId}/template`, {
      kind: "success",
      message: "Profile uses the instance template again",
    }),
  );
}
