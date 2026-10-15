"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { withFlash } from "@/lib/flash";
import { parseForm } from "@/lib/forms";
import { ProductInputSchema } from "@/lib/schemas/product-input";
import { requireRole } from "@/server/auth";
import {
  archiveProduct,
  createProduct,
  deleteProduct,
  toggleProductActive,
  unarchiveProduct,
  updateProduct,
} from "@/server/dal/products";
import { actionT, errorMessage, failedParse, failedWith, str, type ActionState } from "./shared";

const LIST = "/products";

export async function saveProduct(
  id: string | null,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireRole("EDITOR");
  const t = await actionT();
  const parsed = parseForm(ProductInputSchema, formData);
  if (!parsed.ok) return failedParse(parsed, formData);
  let name: string;
  try {
    const saved = id
      ? await updateProduct(actor, id, parsed.data)
      : await createProduct(actor, parsed.data);
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

export async function archiveProductAction(formData: FormData): Promise<void> {
  const actor = await requireRole("EDITOR");
  const t = await actionT();
  await simple(formData, () => archiveProduct(actor, str(formData, "id")), t("productArchived"));
}

export async function unarchiveProductAction(formData: FormData): Promise<void> {
  const actor = await requireRole("EDITOR");
  const t = await actionT();
  await simple(formData, () => unarchiveProduct(actor, str(formData, "id")), t("productRestored"));
}

export async function toggleProductAction(formData: FormData): Promise<void> {
  const actor = await requireRole("EDITOR");
  const t = await actionT();
  const active = str(formData, "isActive") === "true";
  await simple(
    formData,
    () => toggleProductActive(actor, str(formData, "id"), active),
    active ? t("productActivated") : t("productDeactivated"),
  );
}

export async function deleteProductAction(formData: FormData): Promise<void> {
  const actor = await requireRole("EDITOR");
  await simple(formData, () => deleteProduct(actor, str(formData, "id")), "Product deleted");
}
