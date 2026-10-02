"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { withFlash } from "@/lib/flash";
import { formToObject, parseObject, readDisplayConfigFromForm } from "@/lib/forms";
import { InvoiceDraftInputSchema } from "@/lib/schemas/invoice-input";
import { requireRole } from "@/server/auth";
import { ensureDocument, regenerateDocument } from "@/server/dal/documents";
import { isDalError } from "@/server/dal/errors";
import {
  createDraft,
  deleteDraft,
  issueInvoice,
  markSent,
  updateDraft,
  voidAndReissue,
  voidInvoice,
} from "@/server/dal/invoices";
import { errorMessage, failedParse, failedWith, str, type ActionState } from "./shared";

const LIST = "/invoices";
const overview = (id: string) => `${LIST}/${id}`;

/** FormData from the builder → the draft input shape (arrays, nulls, checkbox config). */
function draftInputFromForm(formData: FormData): unknown {
  const raw = formToObject(formData);
  const items = Array.isArray(raw.items) ? raw.items : raw.items ? [raw.items] : [];
  const discount = raw.discount as { type?: string; value?: string } | undefined;
  const ids = raw.paymentMethodIds;
  return {
    ...raw,
    items: items.filter((i) => {
      const it = i as Record<string, string>;
      return (
        (it.description ?? "").trim() || (it.quantity ?? "").trim() || (it.unitPrice ?? "").trim()
      );
    }),
    discount: discount?.type ? { type: discount.type, value: discount.value ?? "" } : null,
    roundingAdjustment:
      typeof raw.roundingAdjustment === "string" && raw.roundingAdjustment.trim()
        ? raw.roundingAdjustment
        : undefined,
    paymentMethodIds: Array.isArray(ids) ? ids : typeof ids === "string" && ids ? [ids] : [],
    displayConfig: readDisplayConfigFromForm(formData, "display"),
  };
}

function scheduleRender(id: string): void {
  after(async () => {
    try {
      await ensureDocument("INVOICE", id);
    } catch (e) {
      console.error("background PDF render failed; the download route will retry", e);
    }
  });
}

export async function saveDraft(
  id: string | null,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireRole("EDITOR");
  const parsed = parseObject(InvoiceDraftInputSchema, draftInputFromForm(formData));
  if (!parsed.ok) return failedParse(parsed, formData);
  let savedId: string;
  try {
    const saved = id
      ? await updateDraft(actor, id, parsed.data)
      : await createDraft(actor, parsed.data);
    savedId = saved.id;
  } catch (e) {
    return failedWith(e, formData);
  }
  revalidatePath(LIST);
  if (str(formData, "intent") === "issue") {
    try {
      const issued = await issueInvoice(actor, savedId);
      scheduleRender(savedId);
      redirect(
        withFlash(overview(savedId), { kind: "success", message: `Issued ${issued.number}` }),
      );
    } catch (e) {
      if (!isDalError(e)) throw e;
      redirect(
        withFlash(overview(savedId), { kind: "error", message: `Saved as draft. ${e.message}` }),
      );
    }
  }
  redirect(withFlash(overview(savedId), { kind: "success", message: "Draft saved" }));
}

export async function issueInvoiceAction(formData: FormData): Promise<void> {
  const actor = await requireRole("EDITOR");
  const id = str(formData, "id");
  let number: string | null = null;
  try {
    number = (await issueInvoice(actor, id)).number;
  } catch (e) {
    redirect(withFlash(overview(id), { kind: "error", message: errorMessage(e) }));
  }
  scheduleRender(id);
  revalidatePath(LIST);
  redirect(withFlash(overview(id), { kind: "success", message: `Issued ${number}` }));
}

export async function voidInvoiceAction(formData: FormData): Promise<void> {
  const actor = await requireRole("EDITOR");
  const id = str(formData, "id");
  try {
    await voidInvoice(actor, id, str(formData, "reason"));
  } catch (e) {
    redirect(withFlash(overview(id), { kind: "error", message: errorMessage(e) }));
  }
  revalidatePath(LIST);
  redirect(withFlash(overview(id), { kind: "success", message: "Invoice voided" }));
}

export async function voidAndReissueAction(formData: FormData): Promise<void> {
  const actor = await requireRole("EDITOR");
  const id = str(formData, "id");
  let newId: string;
  try {
    newId = await voidAndReissue(actor, id, str(formData, "reason"));
  } catch (e) {
    redirect(withFlash(overview(id), { kind: "error", message: errorMessage(e) }));
  }
  revalidatePath(LIST);
  redirect(
    withFlash(`${overview(newId)}/edit`, {
      kind: "success",
      message: "Original voided; edit the replacement draft",
    }),
  );
}

export async function markSentAction(formData: FormData): Promise<void> {
  const actor = await requireRole("EDITOR");
  const id = str(formData, "id");
  try {
    await markSent(actor, id);
  } catch (e) {
    redirect(withFlash(overview(id), { kind: "error", message: errorMessage(e) }));
  }
  revalidatePath(LIST);
  redirect(withFlash(overview(id), { kind: "success", message: "Marked as sent" }));
}

export async function deleteDraftAction(formData: FormData): Promise<void> {
  const actor = await requireRole("EDITOR");
  const id = str(formData, "id");
  try {
    await deleteDraft(actor, id);
  } catch (e) {
    redirect(withFlash(overview(id), { kind: "error", message: errorMessage(e) }));
  }
  revalidatePath(LIST);
  redirect(withFlash(LIST, { kind: "success", message: "Draft deleted" }));
}

export async function regenerateDocumentAction(formData: FormData): Promise<void> {
  const actor = await requireRole("EDITOR");
  const id = str(formData, "id");
  try {
    const doc = await regenerateDocument(actor, "INVOICE", id);
    redirect(
      withFlash(overview(id), { kind: "success", message: `Generated PDF version ${doc.version}` }),
    );
  } catch (e) {
    if (!isDalError(e)) throw e;
    redirect(withFlash(overview(id), { kind: "error", message: e.message }));
  }
}
