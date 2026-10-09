"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { withFlash } from "@/lib/flash";
import { formToObject, parseObject } from "@/lib/forms";
import { ClientInputSchema } from "@/lib/schemas/client-input";
import { requireRole } from "@/server/auth";
import {
  archiveClient,
  createClient,
  deleteClient,
  unarchiveClient,
  updateClient,
} from "@/server/dal/clients";
import { actionT, errorMessage, failedParse, failedWith, str, type ActionState } from "./shared";

const LIST = "/clients";

export async function saveClient(
  id: string | null,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireRole("EDITOR");
  const t = await actionT();
  const raw = formToObject(formData);
  // One country select serves the client and both address blocks; shipping is optional.
  const withCountry = (a: unknown) => ({
    ...((a as object | undefined) ?? {}),
    countryCode: raw.countryCode,
  });
  raw.billingAddress = withCountry(raw.billingAddress);
  raw.shippingAddress = raw.hasShippingAddress === "on" ? withCountry(raw.shippingAddress) : null;
  const parsed = parseObject(ClientInputSchema, raw);
  if (!parsed.ok) return failedParse(parsed, formData);
  let saved: { id: string; displayName: string };
  try {
    saved = id
      ? await updateClient(actor, id, parsed.data)
      : await createClient(actor, parsed.data);
  } catch (e) {
    return failedWith(e, formData);
  }
  revalidatePath(LIST);
  revalidatePath(`${LIST}/${saved.id}`);
  redirect(
    withFlash(`${LIST}/${saved.id}`, {
      kind: "success",
      message: t("saved", { name: saved.displayName }),
    }),
  );
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

export async function archiveClientAction(formData: FormData): Promise<void> {
  const actor = await requireRole("EDITOR");
  const t = await actionT();
  await simple(formData, () => archiveClient(actor, str(formData, "id")), t("clientArchived"));
}

export async function unarchiveClientAction(formData: FormData): Promise<void> {
  const actor = await requireRole("EDITOR");
  const t = await actionT();
  await simple(formData, () => unarchiveClient(actor, str(formData, "id")), t("clientRestored"));
}

export async function deleteClientAction(formData: FormData): Promise<void> {
  const actor = await requireRole("EDITOR");
  const t = await actionT();
  const id = str(formData, "id");
  try {
    await deleteClient(actor, id);
  } catch (e) {
    redirect(withFlash(`${LIST}/${id}`, { kind: "error", message: await errorMessage(e) }));
  }
  revalidatePath(LIST);
  redirect(withFlash(LIST, { kind: "success", message: t("clientDeleted") }));
}
