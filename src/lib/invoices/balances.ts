import type { Tx } from "@/lib/db";
import { D, sum, toMoneyString } from "@/lib/money";

export interface Balances {
  amountPaid: string;
  amountCredited: string;
  balanceDue: string;
}

/**
 * The single code path that derives amountPaid / amountCredited / balanceDue from the payments
 * ledger and issued credit notes (v2 §8.6). Called inside every payment and credit-note
 * transaction, and at issue time.
 */
export async function recalculateBalances(tx: Tx, invoiceId: string): Promise<Balances> {
  const invoice = await tx.invoice.findUniqueOrThrow({
    where: { id: invoiceId },
    select: { total: true, currency: true },
  });
  const [payments, creditNotes] = await Promise.all([
    tx.payment.findMany({ where: { invoiceId }, select: { amountApplied: true } }),
    tx.creditNote.findMany({ where: { invoiceId, status: "ISSUED" }, select: { total: true } }),
  ]);
  const amountPaid = sum(payments.map((p) => D(p.amountApplied)));
  const amountCredited = sum(creditNotes.map((c) => D(c.total)));
  const balanceDue = D(invoice.total).minus(amountPaid).minus(amountCredited);
  const result = {
    amountPaid: toMoneyString(amountPaid, invoice.currency),
    amountCredited: toMoneyString(amountCredited, invoice.currency),
    balanceDue: toMoneyString(balanceDue, invoice.currency),
  };
  await tx.invoice.update({ where: { id: invoiceId }, data: result });
  return result;
}
