"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { CANCEL_REASONS, type CancelReason } from "@/lib/einvoice/gst/connector";
import { withFlash } from "@/lib/flash";
import { parseForm } from "@/lib/forms";
import { findDisallowed } from "@/lib/input-charset";
import { EInvoiceProfileSettingsInputSchema } from "@/lib/schemas/einvoice-settings";
import { requireOwner, requireRole } from "@/server/auth";
import { cancelIrn, generateIrn, recordManualIrn } from "@/server/dal/einvoice";
import { saveEInvoiceProfileSettings } from "@/server/dal/einvoice-settings";
import { InvariantError, isDalError } from "@/server/dal/errors";
import { actionT, failedParse, failedWith, str, type ActionState } from "./shared";

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

/** Invoice page: register the IRN through the configured NIC connector (EDITOR). */
export async function generateIrnAction(formData: FormData): Promise<void> {
  const actor = await requireRole("EDITOR");
  const t = await actionT();
  const id = str(formData, "id");
  try {
    const state = await generateIrn(actor, id);
    redirect(
      withFlash(`/invoices/${id}`, {
        kind: "success",
        message: t("irnRegistered", { irn: state.irn ?? "" }),
      }),
    );
  } catch (e) {
    if (isDalError(e))
      redirect(withFlash(`/invoices/${id}`, { kind: "error", message: e.message }));
    throw e;
  }
}

/** Invoice page: record the portal's response pasted by hand (EDITOR). */
export async function recordManualIrnAction(
  _prev: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireRole("EDITOR");
  const t = await actionT();
  const id = str(formData, "id");
  const response = str(formData, "response");
  if (findDisallowed(response).length) {
    return {
      ok: false,
      fieldErrors: { response: ["only standard keyboard characters"] },
      message: "",
      values: {},
    };
  }
  try {
    await recordManualIrn(actor, id, response);
  } catch (e) {
    return failedWith(e, formData);
  }
  revalidatePath(`/invoices/${id}`);
  redirect(withFlash(`/invoices/${id}`, { kind: "success", message: t("irnRecorded") }));
}

/** Invoice page: cancel a registered IRN within 24 hours (EDITOR). */
export async function cancelIrnAction(formData: FormData): Promise<void> {
  const actor = await requireRole("EDITOR");
  const t = await actionT();
  const id = str(formData, "id");
  const reason = str(formData, "reasonCode");
  const remarks = str(formData, "reason");
  try {
    if (!(reason in CANCEL_REASONS)) throw new InvariantError("Choose a cancellation reason.");
    await cancelIrn(actor, id, reason as CancelReason, remarks);
    redirect(withFlash(`/invoices/${id}`, { kind: "success", message: t("irnCancelled") }));
  } catch (e) {
    if (isDalError(e))
      redirect(withFlash(`/invoices/${id}`, { kind: "error", message: e.message }));
    throw e;
  }
}
