"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { withFlash } from "@/lib/flash";
import { parseForm } from "@/lib/forms";
import { CreditNoteInputSchema } from "@/lib/schemas/credit-note-input";
import { requireOwner } from "@/server/auth";
import {
  createCreditNoteDraft,
  deleteCreditNoteDraft,
  issueCreditNote,
  markCreditNoteSent,
  updateCreditNoteDraft,
  voidCreditNote,
} from "@/server/dal/credit-notes";
import { ensureDocument, regenerateDocument } from "@/server/dal/documents";
import { isDalError } from "@/server/dal/errors";
import { errorMessage, failedParse, failedWith, str, type ActionState } from "./shared";

const LIST = "/credit-notes";
const overview = (id: string) => `${LIST}/${id}`;

function scheduleRender(id: string): void {
  after(async () => {
    try {
      await ensureDocument("CREDIT_NOTE", id);
    } catch (e) {
      console.error("background credit-note PDF render failed; the download route will retry", e);
    }
  });
}

export async function saveCreditNoteDraft(
  id: string | null,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireOwner();
  const parsed = parseForm(CreditNoteInputSchema, formData);
  if (!parsed.ok) return failedParse(parsed, formData);
  let savedId: string;
  let invoiceId: string;
  try {
    const saved = id
      ? await updateCreditNoteDraft(actor, id, parsed.data)
      : await createCreditNoteDraft(actor, parsed.data);
    savedId = saved.id;
    invoiceId = saved.invoiceId;
  } catch (e) {
    return failedWith(e, formData);
  }
  revalidatePath(LIST);
  revalidatePath(`/invoices/${invoiceId}`);
  if (str(formData, "intent") === "issue") {
    try {
      const issued = await issueCreditNote(actor, savedId);
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

export async function issueCreditNoteAction(formData: FormData): Promise<void> {
  const actor = await requireOwner();
  const id = str(formData, "id");
  let number: string | null = null;
  try {
    number = (await issueCreditNote(actor, id)).number;
  } catch (e) {
    redirect(withFlash(overview(id), { kind: "error", message: errorMessage(e) }));
  }
  scheduleRender(id);
  revalidatePath(LIST);
  redirect(withFlash(overview(id), { kind: "success", message: `Issued ${number}` }));
}

export async function voidCreditNoteAction(formData: FormData): Promise<void> {
  const actor = await requireOwner();
  const id = str(formData, "id");
  try {
    await voidCreditNote(actor, id, str(formData, "reason"));
  } catch (e) {
    redirect(withFlash(overview(id), { kind: "error", message: errorMessage(e) }));
  }
  revalidatePath(LIST);
  redirect(
    withFlash(overview(id), {
      kind: "success",
      message: "Credit note voided; the invoice balance is restored",
    }),
  );
}

export async function markCreditNoteSentAction(formData: FormData): Promise<void> {
  const actor = await requireOwner();
  const id = str(formData, "id");
  try {
    await markCreditNoteSent(actor, id);
  } catch (e) {
    redirect(withFlash(overview(id), { kind: "error", message: errorMessage(e) }));
  }
  redirect(withFlash(overview(id), { kind: "success", message: "Marked as sent" }));
}

export async function deleteCreditNoteDraftAction(formData: FormData): Promise<void> {
  const actor = await requireOwner();
  const id = str(formData, "id");
  let invoiceId = "";
  try {
    invoiceId = await deleteCreditNoteDraft(actor, id);
  } catch (e) {
    redirect(withFlash(overview(id), { kind: "error", message: errorMessage(e) }));
  }
  revalidatePath(LIST);
  redirect(
    withFlash(`/invoices/${invoiceId}`, { kind: "success", message: "Draft credit note deleted" }),
  );
}

export async function regenerateCreditNoteDocumentAction(formData: FormData): Promise<void> {
  const actor = await requireOwner();
  const id = str(formData, "id");
  try {
    const doc = await regenerateDocument(actor, "CREDIT_NOTE", id);
    redirect(
      withFlash(overview(id), { kind: "success", message: `Generated PDF version ${doc.version}` }),
    );
  } catch (e) {
    if (!isDalError(e)) throw e;
    redirect(withFlash(overview(id), { kind: "error", message: e.message }));
  }
}
