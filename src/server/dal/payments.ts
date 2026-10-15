import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { compareDates, fromDateString, toDateString, type DateString } from "@/lib/dates";
import { prisma, type Tx } from "@/lib/db";
import { recalculateBalances } from "@/lib/invoices/balances";
import { D, sum, toMoneyString } from "@/lib/money";
import type { PaymentInput } from "@/lib/schemas/payment-input";
import type { Actor } from "@/server/actor";
import { audit } from "./audit";
import { diffForAudit } from "./audit-redact";
import { InvariantError, NotFoundError } from "./errors";
import { requireWriter } from "./authz";
import { lockInvoice } from "./locks";
import {
  ATTACHMENT_INCLUDE,
  syncPaymentAttachments,
  toAttachmentDto,
  type PaymentAttachmentDto,
} from "./payment-attachments";

export type PaymentKind = "PAYMENT" | "REFUND" | "WRITE_OFF";

export interface PaymentDto {
  id: string;
  invoiceId: string;
  kind: PaymentKind;
  paymentDate: DateString;
  amountApplied: string;
  tdsDeducted: string;
  receivedAmount: string | null;
  receivedCurrency: string | null;
  exchangeRate: string | null;
  bankFees: string;
  paymentMethodProfileId: string | null;
  paymentMethodName: string | null;
  reference: string | null;
  notes: string | null;
  /** Receipts and bills on this entry, in display order (addendum §4). */
  attachments: PaymentAttachmentDto[];
  createdAt: string;
}

export interface PaymentLedger {
  invoice: {
    id: string;
    number: string | null;
    status: "DRAFT" | "ISSUED" | "VOID";
    currency: string;
    locale: string;
    total: string;
    amountPaid: string;
    amountCredited: string;
    balanceDue: string;
    clientName: string;
  };
  rows: (PaymentDto & { runningBalance: string })[];
  totals: {
    applied: string;
    byKind: Record<PaymentKind, string>;
    tdsDeducted: string;
    bankFees: string;
  };
}

const INCLUDE = {
  paymentMethod: { select: { name: true } },
  ...ATTACHMENT_INCLUDE,
} satisfies Prisma.PaymentInclude;
type Row = Prisma.PaymentGetPayload<{ include: typeof INCLUDE }>;

function toDto(row: Row, currency: string): PaymentDto {
  return {
    id: row.id,
    invoiceId: row.invoiceId,
    kind: row.kind,
    paymentDate: toDateString(row.paymentDate),
    amountApplied: toMoneyString(row.amountApplied.toString(), currency),
    tdsDeducted: toMoneyString(row.tdsDeducted.toString(), currency),
    receivedAmount:
      row.receivedAmount && row.receivedCurrency
        ? toMoneyString(row.receivedAmount.toString(), row.receivedCurrency)
        : null,
    receivedCurrency: row.receivedCurrency,
    exchangeRate: row.exchangeRate ? D(row.exchangeRate.toString()).toString() : null,
    bankFees: toMoneyString(row.bankFees.toString(), currency),
    paymentMethodProfileId: row.paymentMethodProfileId,
    paymentMethodName: row.paymentMethod?.name ?? null,
    reference: row.reference,
    notes: row.notes,
    attachments: row.attachments.map(toAttachmentDto),
    createdAt: row.createdAt.toISOString(),
  };
}

function toData(input: PaymentInput) {
  return {
    kind: input.kind,
    paymentDate: fromDateString(input.paymentDate),
    amountApplied: input.amountApplied,
    tdsDeducted: input.tdsDeducted,
    receivedAmount: input.receivedAmount ?? null,
    receivedCurrency: input.receivedCurrency ?? null,
    exchangeRate: input.exchangeRate ?? null,
    bankFees: input.bankFees,
    paymentMethodProfileId: input.paymentMethodProfileId ?? null,
    reference: input.reference ?? null,
    notes: input.notes ?? null,
  };
}

function auditView(row: Row) {
  return {
    kind: row.kind,
    paymentDate: toDateString(row.paymentDate),
    amountApplied: row.amountApplied.toString(),
    tdsDeducted: row.tdsDeducted.toString(),
    receivedAmount: row.receivedAmount?.toString() ?? null,
    receivedCurrency: row.receivedCurrency,
    exchangeRate: row.exchangeRate?.toString() ?? null,
    bankFees: row.bankFees.toString(),
    paymentMethodProfileId: row.paymentMethodProfileId,
    reference: row.reference,
    notes: row.notes,
    attachmentAssetIds: row.attachments.map((a) => a.assetId),
  };
}

/**
 * SPEC §4.8 rules, evaluated against the balance *without* the payment being edited:
 * payments and write-offs may not exceed the outstanding balance; refunds may not exceed what
 * was paid.
 */
function assertWithinLimits(
  input: PaymentInput,
  balances: { balanceDue: string; amountPaid: string },
  currency: string,
): void {
  const amount = D(input.amountApplied);
  const outstanding = D(balances.balanceDue);
  if (input.kind === "REFUND") {
    if (amount.abs().gt(D(balances.amountPaid))) {
      throw new InvariantError(
        `A refund cannot exceed the amount paid so far (${toMoneyString(balances.amountPaid, currency)}).`,
        { amountApplied: ["refund exceeds the amount paid"] },
      );
    }
    return;
  }
  if (amount.gt(outstanding)) {
    throw new InvariantError(
      `${input.kind === "WRITE_OFF" ? "A write-off" : "A payment"} of ${toMoneyString(amount, currency)} exceeds the outstanding balance of ${toMoneyString(outstanding, currency)}.`,
      { amountApplied: ["exceeds the outstanding balance"] },
    );
  }
}

function assertNotBeforeInvoice(paymentDate: DateString, invoiceIssueDate: Date): void {
  const invoiceDate = toDateString(invoiceIssueDate);
  if (compareDates(paymentDate, invoiceDate) < 0) {
    throw new InvariantError(
      `A payment cannot be dated before the invoice was issued (${invoiceDate}).`,
      { paymentDate: ["before the invoice"] },
    );
  }
}

async function loadInvoice(tx: Tx, invoiceId: string) {
  await lockInvoice(tx, invoiceId); // serialises concurrent ledger changes (review finding)
  const invoice = await tx.invoice.findUnique({
    where: { id: invoiceId },
    select: {
      id: true,
      status: true,
      number: true,
      currency: true,
      total: true,
      amountPaid: true,
      amountCredited: true,
      balanceDue: true,
      issueDate: true,
      issuerProfile: { select: { locale: true } },
      client: { select: { displayName: true } },
    },
  });
  if (!invoice) throw new NotFoundError("Invoice", invoiceId);
  return invoice;
}

export async function recordPayment(
  actor: Actor,
  invoiceId: string,
  input: PaymentInput,
): Promise<PaymentDto> {
  requireWriter(actor);
  return prisma.$transaction(async (tx) => {
    const invoice = await loadInvoice(tx, invoiceId);
    if (invoice.status !== "ISSUED") {
      throw new InvariantError("Only issued invoices accept payments.");
    }
    assertNotBeforeInvoice(input.paymentDate, invoice.issueDate);
    const balances = await recalculateBalances(tx, invoiceId);
    assertWithinLimits(input, balances, invoice.currency);
    const created = await tx.payment.create({ data: { invoiceId, ...toData(input) } });
    await syncPaymentAttachments(tx, created.id, input.attachmentAssetIds);
    const row = await tx.payment.findUniqueOrThrow({
      where: { id: created.id },
      include: INCLUDE,
    });
    await recalculateBalances(tx, invoiceId);
    await audit(tx, actor, "payment.created", "Payment", row.id, {
      summary: `${input.kind.toLowerCase().replace("_", "-")} of ${toMoneyString(input.amountApplied, invoice.currency)} on ${invoice.number}`,
      after: { ...auditView(row), invoiceId },
    });
    return toDto(row, invoice.currency);
  });
}

export async function updatePayment(
  actor: Actor,
  paymentId: string,
  input: PaymentInput,
): Promise<PaymentDto> {
  requireWriter(actor);
  return prisma.$transaction(async (tx) => {
    const before = await tx.payment.findUnique({ where: { id: paymentId }, include: INCLUDE });
    if (!before) throw new NotFoundError("Payment", paymentId);
    const invoice = await loadInvoice(tx, before.invoiceId);
    if (invoice.status !== "ISSUED") {
      throw new InvariantError("Only issued invoices accept payment changes.");
    }
    assertNotBeforeInvoice(input.paymentDate, invoice.issueDate);
    const current = await recalculateBalances(tx, invoice.id);
    // Evaluate the limits as if this payment did not exist yet.
    const without = {
      balanceDue: toMoneyString(
        D(current.balanceDue).plus(D(before.amountApplied.toString())),
        invoice.currency,
      ),
      amountPaid: toMoneyString(
        D(current.amountPaid).minus(D(before.amountApplied.toString())),
        invoice.currency,
      ),
    };
    assertWithinLimits(input, without, invoice.currency);
    await tx.payment.update({ where: { id: paymentId }, data: toData(input) });
    await syncPaymentAttachments(tx, paymentId, input.attachmentAssetIds);
    const row = await tx.payment.findUniqueOrThrow({ where: { id: paymentId }, include: INCLUDE });
    await recalculateBalances(tx, invoice.id);
    const diff = diffForAudit(auditView(before), auditView(row));
    await audit(tx, actor, "payment.updated", "Payment", paymentId, {
      summary: `Edited a ${row.kind.toLowerCase().replace("_", "-")} on ${invoice.number}`,
      before: diff.before,
      after: diff.after,
    });
    return toDto(row, invoice.currency);
  });
}

export async function deletePayment(actor: Actor, paymentId: string): Promise<string> {
  requireWriter(actor);
  return prisma.$transaction(async (tx) => {
    const row = await tx.payment.findUnique({ where: { id: paymentId }, include: INCLUDE });
    if (!row) throw new NotFoundError("Payment", paymentId);
    const invoice = await loadInvoice(tx, row.invoiceId);
    await tx.payment.delete({ where: { id: paymentId } });
    await recalculateBalances(tx, row.invoiceId);
    await audit(tx, actor, "payment.deleted", "Payment", paymentId, {
      summary: `Deleted a ${row.kind.toLowerCase().replace("_", "-")} of ${toMoneyString(row.amountApplied.toString(), invoice.currency)} on ${invoice.number}`,
      before: { ...auditView(row), invoiceId: row.invoiceId },
    });
    return row.invoiceId;
  });
}

export async function getPayment(_actor: Actor, paymentId: string): Promise<PaymentDto> {
  const row = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { ...INCLUDE, invoice: { select: { currency: true } } },
  });
  if (!row) throw new NotFoundError("Payment", paymentId);
  return toDto(row, row.invoice.currency);
}

/** The invoice's ledger: chronological rows with a running balance and totals by kind. */
export async function listPayments(_actor: Actor, invoiceId: string): Promise<PaymentLedger> {
  const invoice = await loadInvoice(prisma, invoiceId);
  const rows = await prisma.payment.findMany({
    where: { invoiceId },
    include: INCLUDE,
    orderBy: [{ paymentDate: "asc" }, { createdAt: "asc" }],
  });
  const c = invoice.currency;
  let running = D(invoice.total.toString()).minus(D(invoice.amountCredited.toString()));
  const byKind: Record<PaymentKind, ReturnType<typeof D>> = {
    PAYMENT: D(0),
    REFUND: D(0),
    WRITE_OFF: D(0),
  };
  const out = rows.map((r) => {
    const amount = D(r.amountApplied.toString());
    running = running.minus(amount);
    byKind[r.kind] = byKind[r.kind].plus(amount);
    return { ...toDto(r, c), runningBalance: toMoneyString(running, c) };
  });
  return {
    invoice: {
      id: invoice.id,
      number: invoice.number,
      status: invoice.status,
      currency: c,
      locale: invoice.issuerProfile.locale,
      total: toMoneyString(invoice.total.toString(), c),
      amountPaid: toMoneyString(invoice.amountPaid.toString(), c),
      amountCredited: toMoneyString(invoice.amountCredited.toString(), c),
      balanceDue: toMoneyString(invoice.balanceDue.toString(), c),
      clientName: invoice.client.displayName,
    },
    rows: out,
    totals: {
      applied: toMoneyString(sum(rows.map((r) => D(r.amountApplied.toString()))), c),
      byKind: {
        PAYMENT: toMoneyString(byKind.PAYMENT, c),
        REFUND: toMoneyString(byKind.REFUND, c),
        WRITE_OFF: toMoneyString(byKind.WRITE_OFF, c),
      },
      tdsDeducted: toMoneyString(sum(rows.map((r) => D(r.tdsDeducted.toString()))), c),
      bankFees: toMoneyString(sum(rows.map((r) => D(r.bankFees.toString()))), c),
    },
  };
}
