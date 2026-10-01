"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { withFlash } from "@/lib/flash";
import { parseForm } from "@/lib/forms";
import {
  EmailDefaultsInputSchema,
  SendEmailInputSchema,
  SmtpSettingsInputSchema,
} from "@/lib/schemas/email-input";
import { requireOwner } from "@/server/auth";
import type { DocumentKind } from "@/server/dal/documents";
import { markSentManually, sendDocumentEmail } from "@/server/dal/emails";
import { isDalError } from "@/server/dal/errors";
import {
  clearSmtpSettings,
  saveEmailDefaults,
  saveSmtpSettings,
  sendTestEmail,
} from "@/server/dal/smtp-settings";
import { errorMessage, failedParse, failedWith, str, type ActionState, valuesOf } from "./shared";

const SETTINGS = "/settings/email";
const backOf = (kind: DocumentKind, id: string) =>
  kind === "INVOICE" ? `/invoices/${id}` : `/credit-notes/${id}`;

export async function sendEmailAction(
  kind: DocumentKind,
  id: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireOwner();
  const parsed = parseForm(SendEmailInputSchema, formData);
  if (!parsed.ok) return failedParse(parsed, formData);
  let status: "SENT" | "FAILED" | "MANUAL";
  let error: string | null = null;
  try {
    const result = await sendDocumentEmail(actor, { ...parsed.data, kind, id });
    status = result.status;
    error = result.error;
  } catch (e) {
    return failedWith(e, formData);
  }
  revalidatePath(backOf(kind, id));
  if (status === "FAILED") {
    return {
      ok: false,
      fieldErrors: {},
      message: `The mail server refused the message: ${error ?? "unknown error"}. The attempt was logged.`,
      values: valuesOf(formData),
    };
  }
  redirect(
    withFlash(backOf(kind, id), {
      kind: "success",
      message: `Sent to ${parsed.data.to.join(", ")}`,
    }),
  );
}

export async function markSentManuallyAction(formData: FormData): Promise<void> {
  const actor = await requireOwner();
  const kind = (
    str(formData, "kind") === "CREDIT_NOTE" ? "CREDIT_NOTE" : "INVOICE"
  ) as DocumentKind;
  const id = str(formData, "id");
  try {
    await markSentManually(actor, kind, id);
  } catch (e) {
    redirect(withFlash(backOf(kind, id), { kind: "error", message: errorMessage(e) }));
  }
  revalidatePath(backOf(kind, id));
  redirect(withFlash(backOf(kind, id), { kind: "success", message: "Marked as sent" }));
}

export async function saveSmtpAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireOwner();
  const parsed = parseForm(SmtpSettingsInputSchema, formData);
  if (!parsed.ok) return failedParse(parsed, formData);
  try {
    await saveSmtpSettings(actor, parsed.data);
  } catch (e) {
    return failedWith(e, formData);
  }
  revalidatePath(SETTINGS);
  redirect(withFlash(SETTINGS, { kind: "success", message: "SMTP settings saved" }));
}

export async function clearSmtpAction(): Promise<void> {
  const actor = await requireOwner();
  await clearSmtpSettings(actor);
  revalidatePath(SETTINGS);
  redirect(withFlash(SETTINGS, { kind: "success", message: "Stored SMTP settings removed" }));
}

export async function sendTestEmailAction(): Promise<void> {
  const actor = await requireOwner();
  let result: { ok: true } | { ok: false; error: string };
  try {
    result = await sendTestEmail(actor);
  } catch (e) {
    if (!isDalError(e)) throw e;
    redirect(withFlash(SETTINGS, { kind: "error", message: e.message }));
  }
  redirect(
    withFlash(
      SETTINGS,
      result.ok
        ? { kind: "success", message: `Test email sent to ${actor.email}` }
        : { kind: "error", message: `Test failed: ${result.error}` },
    ),
  );
}

export async function saveEmailDefaultsAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireOwner();
  const parsed = parseForm(EmailDefaultsInputSchema, formData);
  if (!parsed.ok) return failedParse(parsed, formData);
  try {
    await saveEmailDefaults(actor, parsed.data);
  } catch (e) {
    return failedWith(e, formData);
  }
  revalidatePath(SETTINGS);
  redirect(withFlash(SETTINGS, { kind: "success", message: "Default recipients saved" }));
}
