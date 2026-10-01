import { compareDates, type DateString } from "@/lib/dates";
import type { Decimal } from "@/lib/money";

/** Derived display status (SPEC.md §4.6) — never stored. */
export type DisplayStatus =
  "DRAFT" | "ISSUED" | "SENT" | "PARTIALLY_PAID" | "PAID" | "OVERDUE" | "VOID";

export interface StatusInput {
  status: "DRAFT" | "ISSUED" | "VOID";
  sentAt: Date | null;
  dueDate: DateString;
  balanceDue: Decimal;
  amountPaid: Decimal;
  amountCredited: Decimal;
  total: Decimal;
}

/**
 * `today` is the calendar date where the viewer is (`todayIn(user.timezone)`), never the server's:
 * whether an invoice is overdue depends on who is looking.
 */
export function displayStatus(inv: StatusInput, today: DateString): DisplayStatus {
  if (inv.status === "DRAFT") return "DRAFT";
  if (inv.status === "VOID") return "VOID";

  const settled = inv.total.gt(0) || inv.amountPaid.gt(0) || inv.amountCredited.gt(0);
  if (inv.balanceDue.lte(0) && settled) return "PAID";
  if (inv.amountPaid.gt(0) && inv.balanceDue.gt(0)) return "PARTIALLY_PAID";
  if (inv.balanceDue.gt(0) && compareDates(inv.dueDate, today) < 0) return "OVERDUE";
  if (inv.sentAt) return "SENT";
  return "ISSUED";
}

export const STATUS_LABELS: Record<DisplayStatus, string> = {
  DRAFT: "Draft",
  ISSUED: "Issued",
  SENT: "Sent",
  PARTIALLY_PAID: "Partially paid",
  PAID: "Paid",
  OVERDUE: "Overdue",
  VOID: "Void",
};
