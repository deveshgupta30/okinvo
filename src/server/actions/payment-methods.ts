"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { withFlash } from "@/lib/flash";
import { formToObject, parseObject } from "@/lib/forms";
import { PaymentMethodInputSchema } from "@/lib/schemas/payment-method-input";
import { requireOwner } from "@/server/auth";
import {
  archivePaymentMethod,
  createPaymentMethod,
  deletePaymentMethod,
  setDefaultPaymentMethod,
  unarchivePaymentMethod,
  updatePaymentMethod,
} from "@/server/dal/payment-methods";
import { errorMessage, failedParse, failedWith, str, type ActionState } from "./shared";

const LIST = "/settings/payment-methods";

export async function savePaymentMethod(
  id: string | null,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireOwner();
  const raw = formToObject(formData);
  const type = String(raw.type ?? "");
  const detailsRaw = (raw.details ?? {}) as Record<string, unknown>;
  const details: Record<string, unknown> = { type };
  if (type === "CUSTOM") {
    details.lines = String(detailsRaw.linesText ?? "")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
  } else {
    for (const [k, v] of Object.entries(detailsRaw)) {
      if (k !== "linesText" && typeof v === "string" && v.trim()) details[k] = v.trim();
    }
  }
  const parsed = parseObject(PaymentMethodInputSchema, { ...raw, details });
  if (!parsed.ok) return failedParse(parsed, formData);
  let name: string;
  try {
    const saved = id
      ? await updatePaymentMethod(actor, id, parsed.data)
      : await createPaymentMethod(actor, parsed.data);
    name = saved.name;
  } catch (e) {
    return failedWith(e, formData);
  }
  revalidatePath(LIST);
  redirect(withFlash(LIST, { kind: "success", message: `Saved ${name}` }));
}

async function simple(formData: FormData, fn: () => Promise<void>, success: string) {
  try {
    await fn();
  } catch (e) {
    redirect(withFlash(LIST, { kind: "error", message: errorMessage(e) }));
  }
  revalidatePath(LIST);
  redirect(withFlash(LIST, { kind: "success", message: success }));
}

export async function setDefaultPaymentMethodAction(formData: FormData): Promise<void> {
  const actor = await requireOwner();
  await simple(
    formData,
    () => setDefaultPaymentMethod(actor, str(formData, "id")),
    "Default payment method updated",
  );
}

export async function archivePaymentMethodAction(formData: FormData): Promise<void> {
  const actor = await requireOwner();
  await simple(
    formData,
    () => archivePaymentMethod(actor, str(formData, "id")),
    "Payment method archived",
  );
}

export async function unarchivePaymentMethodAction(formData: FormData): Promise<void> {
  const actor = await requireOwner();
  await simple(
    formData,
    () => unarchivePaymentMethod(actor, str(formData, "id")),
    "Payment method restored",
  );
}

export async function deletePaymentMethodAction(formData: FormData): Promise<void> {
  const actor = await requireOwner();
  await simple(
    formData,
    () => deletePaymentMethod(actor, str(formData, "id")),
    "Payment method deleted",
  );
}
