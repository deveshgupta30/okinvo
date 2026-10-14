"use server";

import { revalidatePath } from "next/cache";
import { parseForm } from "@/lib/forms";
import { EInvoiceProfileSettingsInputSchema } from "@/lib/schemas/einvoice-settings";
import { requireOwner } from "@/server/auth";
import { saveEInvoiceProfileSettings } from "@/server/dal/einvoice-settings";
import { actionT, failedParse, failedWith, type ActionState } from "./shared";

const PAGE = "/settings/einvoicing";

export type EInvoiceSettingsState = ActionState | { ok: true; message: string };

/** Settings → E-invoicing: one profile's connector and credentials (OWNER). */
export async function saveEInvoiceSettingsAction(
  _prev: EInvoiceSettingsState | null,
  formData: FormData,
): Promise<EInvoiceSettingsState> {
  const actor = await requireOwner();
  const t = await actionT();
  const parsed = parseForm(EInvoiceProfileSettingsInputSchema, formData);
  if (!parsed.ok) return failedParse(parsed, formData);
  try {
    await saveEInvoiceProfileSettings(actor, parsed.data);
  } catch (e) {
    return failedWith(e, formData);
  }
  revalidatePath(PAGE);
  return { ok: true, message: t("einvoiceSettingsSaved") };
}
