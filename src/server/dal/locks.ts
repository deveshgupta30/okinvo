import "server-only";
import type { Tx } from "@/lib/db";

/**
 * Row locks for the state-changing transactions (review finding): under READ COMMITTED, two
 * overlapping requests on the same invoice both read it as DRAFT (or read the same balance) and
 * both succeed - burning a number or over-recording a payment. `SELECT … FOR UPDATE` makes the
 * second one wait and then see the first one's result. Always the first statement of the
 * transaction, before any read the decision depends on.
 */
export async function lockInvoice(tx: Tx, invoiceId: string): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "Invoice" WHERE "id" = ${invoiceId} FOR UPDATE`;
}

export async function lockCreditNote(tx: Tx, creditNoteId: string): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "CreditNote" WHERE "id" = ${creditNoteId} FOR UPDATE`;
}
