"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { withFlash } from "@/lib/flash";
import { formToObject, parseObject, readDisplayConfigFromForm } from "@/lib/forms";
import { ProfileInputSchema } from "@/lib/schemas/profile-input";
import { requireOwner } from "@/server/auth";
import {
  archiveProfile,
  createProfile,
  deleteProfile,
  setDefaultProfile,
  unarchiveProfile,
  updateProfile,
} from "@/server/dal/profiles";
import { actionT, errorMessage, failedParse, failedWith, str, type ActionState } from "./shared";

const LIST = "/settings/profiles";

export async function saveProfile(
  id: string | null,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireOwner();
  const t = await actionT();
  const raw = formToObject(formData);
  // One country select serves the profile and its address block.
  raw.address = { ...((raw.address as object | undefined) ?? {}), countryCode: raw.countryCode };
  const parsed = parseObject(ProfileInputSchema, {
    ...raw,
    defaultDisplayConfig: readDisplayConfigFromForm(formData, "display"),
    templateConfigOverride: raw.templateConfigOverrideJson
      ? JSON.parse(String(raw.templateConfigOverrideJson))
      : null,
  });
  if (!parsed.ok) return failedParse(parsed, formData);
  let label: string;
  try {
    const saved = id
      ? await updateProfile(actor, id, parsed.data)
      : await createProfile(actor, parsed.data);
    label = saved.label;
  } catch (e) {
    return failedWith(e, formData);
  }
  revalidatePath(LIST);
  redirect(withFlash(LIST, { kind: "success", message: t("savedProfile", { label }) }));
}

async function simple(
  formData: FormData,
  fn: (actorId: string) => Promise<void>,
  success: string,
): Promise<void> {
  const actor = await requireOwner();
  try {
    await fn(actor.userId);
  } catch (e) {
    redirect(withFlash(LIST, { kind: "error", message: await errorMessage(e) }));
  }
  revalidatePath(LIST);
  redirect(withFlash(str(formData, "returnTo") || LIST, { kind: "success", message: success }));
}

export async function setDefaultProfileAction(formData: FormData): Promise<void> {
  const actor = await requireOwner();
  const t = await actionT();
  await simple(
    formData,
    () => setDefaultProfile(actor, str(formData, "id")),
    t("defaultProfileUpdated"),
  );
}

export async function archiveProfileAction(formData: FormData): Promise<void> {
  const actor = await requireOwner();
  const t = await actionT();
  await simple(formData, () => archiveProfile(actor, str(formData, "id")), t("profileArchived"));
}

export async function unarchiveProfileAction(formData: FormData): Promise<void> {
  const actor = await requireOwner();
  const t = await actionT();
  await simple(formData, () => unarchiveProfile(actor, str(formData, "id")), t("profileRestored"));
}

export async function deleteProfileAction(formData: FormData): Promise<void> {
  const actor = await requireOwner();
  const t = await actionT();
  await simple(formData, () => deleteProfile(actor, str(formData, "id")), t("profileDeleted"));
}
