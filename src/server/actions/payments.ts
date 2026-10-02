"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { withFlash } from "@/lib/flash";
import { parseForm } from "@/lib/forms";
import { PaymentInputSchema } from "@/lib/schemas/payment-input";
import { requireRole } from "@/server/auth";
import { deletePayment, recordPayment, updatePayment } from "@/server/dal/payments";
import { errorMessage, failedParse, failedWith, str, type ActionState } from "./shared";

const ledger = (invoiceId: string) => `/invoices/${invoiceId}/payments`;

export async function savePayment(
  invoiceId: string,
  paymentId: string | null,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireRole("EDITOR");
  const parsed = parseForm(PaymentInputSchema, formData);
  if (!parsed.ok) return failedParse(parsed, formData);
  try {
    if (paymentId) await updatePayment(actor, paymentId, parsed.data);
    else await recordPayment(actor, invoiceId, parsed.data);
  } catch (e) {
    return failedWith(e, formData);
  }
  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/invoices");
  redirect(
    withFlash(ledger(invoiceId), {
      kind: "success",
      message: paymentId ? "Payment updated" : "Payment recorded",
    }),
  );
}

export async function deletePaymentAction(formData: FormData): Promise<void> {
  const actor = await requireRole("EDITOR");
  const id = str(formData, "id");
  const invoiceId = str(formData, "invoiceId");
  try {
    await deletePayment(actor, id);
  } catch (e) {
    redirect(withFlash(ledger(invoiceId), { kind: "error", message: errorMessage(e) }));
  }
  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/invoices");
  redirect(withFlash(ledger(invoiceId), { kind: "success", message: "Payment deleted" }));
}
