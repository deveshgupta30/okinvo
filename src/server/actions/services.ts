"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { withFlash } from "@/lib/flash";
import { parseForm } from "@/lib/forms";
import { ServiceInputSchema } from "@/lib/schemas/service-input";
import { requireRole } from "@/server/auth";
import {
  archiveService,
  createService,
  deleteService,
  toggleServiceActive,
  unarchiveService,
  updateService,
} from "@/server/dal/services";
import { actionT, errorMessage, failedParse, failedWith, str, type ActionState } from "./shared";

const LIST = "/services";

export async function saveService(
  id: string | null,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireRole("EDITOR");
  const t = await actionT();
  const parsed = parseForm(ServiceInputSchema, formData);
  if (!parsed.ok) return failedParse(parsed, formData);
  let name: string;
  try {
    const saved = id
      ? await updateService(actor, id, parsed.data)
      : await createService(actor, parsed.data);
    name = saved.name;
  } catch (e) {
    return failedWith(e, formData);
  }
  revalidatePath(LIST);
  redirect(withFlash(LIST, { kind: "success", message: t("saved", { name }) }));
}

async function simple(formData: FormData, fn: () => Promise<void>, success: string) {
  const back = str(formData, "returnTo") || LIST;
  try {
    await fn();
  } catch (e) {
    redirect(withFlash(back, { kind: "error", message: await errorMessage(e) }));
  }
  revalidatePath(LIST);
  redirect(withFlash(back, { kind: "success", message: success }));
}

export async function archiveServiceAction(formData: FormData): Promise<void> {
  const actor = await requireRole("EDITOR");
  const t = await actionT();
  await simple(formData, () => archiveService(actor, str(formData, "id")), t("serviceArchived"));
}

export async function unarchiveServiceAction(formData: FormData): Promise<void> {
  const actor = await requireRole("EDITOR");
  const t = await actionT();
  await simple(formData, () => unarchiveService(actor, str(formData, "id")), t("serviceRestored"));
}

export async function toggleServiceAction(formData: FormData): Promise<void> {
  const actor = await requireRole("EDITOR");
  const t = await actionT();
  const active = str(formData, "isActive") === "true";
  await simple(
    formData,
    () => toggleServiceActive(actor, str(formData, "id"), active),
    active ? t("serviceActivated") : t("serviceDeactivated"),
  );
}

export async function deleteServiceAction(formData: FormData): Promise<void> {
  const actor = await requireRole("EDITOR");
  await simple(formData, () => deleteService(actor, str(formData, "id")), "Service deleted");
}
