import { D } from "@/lib/money";

/** What the checkpoints are computed from: the invoice DTO and its ledger rows, nothing new. */
export interface ProgressInvoice {
  status: "DRAFT" | "ISSUED" | "VOID";
  sentAt: string | null;
  balanceDue: string;
}

export interface ProgressPayment {
  id: string;
  kind: "PAYMENT" | "REFUND" | "WRITE_OFF";
  amountApplied: string;
  paymentDate: string;
  attachmentCount: number;
}

export type CheckpointKey = "issued" | "sent" | "payment" | "paid" | "receipt";

export interface Checkpoint {
  key: CheckpointKey;
  done: boolean;
  /** Stable React key: the payment id for payment lines, the checkpoint key otherwise. */
  id: string;
  /** Set on payment lines (addendum §4: "one per payment, with amount and date"). */
  amount?: string;
  date?: string;
}

/**
 * The invoice page's "Payment progress" list (addendum §4): Issued → Sent → Payment recorded
 * (one line per payment, a single undone line while there is none) → Paid in full → Receipt
 * attached. Every state is derived from the invoice and its ledger; nothing is stored.
 */
export function paymentCheckpoints(
  invoice: ProgressInvoice,
  payments: readonly ProgressPayment[],
): Checkpoint[] {
  const issued = invoice.status !== "DRAFT";
  const received = payments.filter((p) => p.kind === "PAYMENT");
  const paymentLines: Checkpoint[] =
    received.length > 0
      ? received.map((p) => ({
          key: "payment",
          done: true,
          id: p.id,
          amount: p.amountApplied,
          date: p.paymentDate,
        }))
      : [{ key: "payment", done: false, id: "payment" }];
  return [
    { key: "issued", done: issued, id: "issued" },
    { key: "sent", done: Boolean(invoice.sentAt), id: "sent" },
    ...paymentLines,
    {
      key: "paid",
      done: invoice.status === "ISSUED" && D(invoice.balanceDue).isZero(),
      id: "paid",
    },
    { key: "receipt", done: payments.some((p) => p.attachmentCount > 0), id: "receipt" },
  ];
}
