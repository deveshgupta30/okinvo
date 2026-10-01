import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { creditNoteTaxLines } from "@/lib/credit-notes/apportion";
import { randomToken } from "@/lib/crypto";
import { fromDateString, todayIn, toDateString, type DateString } from "@/lib/dates";
import { prisma, type Tx } from "@/lib/db";
import { recalculateBalances } from "@/lib/invoices/balances";
import { D, sum, toMoneyString } from "@/lib/money";
import { fiscalYearOf, formatDocumentNumber } from "@/lib/numbering";
import { allocateDocumentNumber } from "@/lib/numbering/allocate";
import {
  CreditNoteSnapshotSchema,
  mergeDisplayConfig,
  mergeTemplateConfig,
  type CreditNoteSnapshot,
  type DisplayConfig,
  type TemplateConfig,
} from "@/lib/schemas";
import type { CreditNoteInput } from "@/lib/schemas/credit-note-input";
import type { SupplyType } from "@/lib/tax";
import type { Actor } from "@/server/actor";
import { audit } from "./audit";
import { InvariantError, NotFoundError } from "./errors";
import { resolveDateRange } from "./fiscal-range";
import type { TaxLineDto } from "./invoices";
import { resolveTemplateConfig } from "./templates";

export type CreditNoteDisplayStatus = "DRAFT" | "ISSUED" | "SENT" | "VOID";

export interface CreditNoteListRow {
  id: string;
  invoiceId: string;
  status: "DRAFT" | "ISSUED" | "VOID";
  displayStatus: CreditNoteDisplayStatus;
  number: string | null;
  issueDate: DateString;
  currency: string;
  locale: string;
  subtotal: string;
  taxAmount: string;
  total: string;
  reason: string;
  invoiceNumber: string | null;
  clientId: string;
  clientName: string;
  issuerProfileId: string;
  issuerLabel: string;
}

export interface CreditNoteDto extends CreditNoteListRow {
  fiscalYear: string | null;
  sequenceNumber: number | null;
  issuedAt: string | null;
  sentAt: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  supplyType: SupplyType;
  taxLines: TaxLineDto[];
  displayConfig: DisplayConfig;
  templateSnapshot: TemplateConfig | null;
  snapshot: CreditNoteSnapshot | null;
  verificationToken: string;
  invoice: {
    id: string;
    number: string | null;
    status: "DRAFT" | "ISSUED" | "VOID";
    issueDate: DateString;
    total: string;
    taxableAmount: string;
    balanceDue: string;
    amountCredited: string;
  };
  documents: {
    id: string;
    version: number;
    sha256: string;
    byteSize: number;
    generatedAt: string;
  }[];
  createdAt: string;
  updatedAt: string;
}

const INCLUDE = {
  taxLines: { orderBy: [{ taxType: "asc" }, { rate: "asc" }] },
  issuerProfile: { select: { label: true, locale: true } },
  client: { select: { displayName: true } },
  invoice: {
    select: {
      id: true,
      number: true,
      status: true,
      issueDate: true,
      total: true,
      taxableAmount: true,
      balanceDue: true,
      amountCredited: true,
    },
  },
  documents: { orderBy: { version: "asc" } },
} satisfies Prisma.CreditNoteInclude;
type Row = Prisma.CreditNoteGetPayload<{ include: typeof INCLUDE }>;

const json = (v: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;

function statusOf(row: {
  status: "DRAFT" | "ISSUED" | "VOID";
  sentAt: Date | null;
}): CreditNoteDisplayStatus {
  if (row.status === "ISSUED") return row.sentAt ? "SENT" : "ISSUED";
  return row.status;
}

function toDto(row: Row): CreditNoteDto {
  const c = row.currency;
  const m = (v: Prisma.Decimal) => toMoneyString(v.toString(), c);
  return {
    id: row.id,
    invoiceId: row.invoiceId,
    status: row.status,
    displayStatus: statusOf(row),
    number: row.number,
    fiscalYear: row.fiscalYear,
    sequenceNumber: row.sequenceNumber,
    issueDate: toDateString(row.issueDate),
    issuedAt: row.issuedAt?.toISOString() ?? null,
    sentAt: row.sentAt?.toISOString() ?? null,
    voidedAt: row.voidedAt?.toISOString() ?? null,
    voidReason: row.voidReason,
    reason: row.reason,
    currency: c,
    locale: row.issuerProfile.locale,
    supplyType: row.supplyType,
    subtotal: m(row.subtotal),
    taxAmount: m(row.taxAmount),
    total: m(row.total),
    taxLines: row.taxLines.map((t) => ({
      taxType: t.taxType,
      rate: D(t.rate.toString()).toString(),
      taxableAmount: m(t.taxableAmount),
      taxAmount: m(t.taxAmount),
    })),
    displayConfig: mergeDisplayConfig(row.displayConfig),
    templateSnapshot: row.templateSnapshot ? mergeTemplateConfig(row.templateSnapshot) : null,
    snapshot: (row.snapshot as CreditNoteSnapshot | null) ?? null,
    verificationToken: row.verificationToken,
    invoiceNumber: row.invoice.number,
    clientId: row.clientId,
    clientName: row.client.displayName,
    issuerProfileId: row.issuerProfileId,
    issuerLabel: row.issuerProfile.label,
    invoice: {
      id: row.invoice.id,
      number: row.invoice.number,
      status: row.invoice.status,
      issueDate: toDateString(row.invoice.issueDate),
      total: m(row.invoice.total),
      taxableAmount: m(row.invoice.taxableAmount),
      balanceDue: m(row.invoice.balanceDue),
      amountCredited: m(row.invoice.amountCredited),
    },
    documents: row.documents.map((d) => ({
      id: d.id,
      version: d.version,
      sha256: d.sha256,
      byteSize: d.byteSize,
      generatedAt: d.generatedAt.toISOString(),
    })),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function load(tx: Tx, id: string): Promise<Row> {
  const row = await tx.creditNote.findUnique({ where: { id }, include: INCLUDE });
  if (!row) throw new NotFoundError("Credit note", id);
  return row;
}

async function loadInvoiceForCredit(tx: Tx, invoiceId: string) {
  const invoice = await tx.invoice.findUnique({
    where: { id: invoiceId },
    include: { taxLines: true, issuerProfile: true },
  });
  if (!invoice) throw new NotFoundError("Invoice", invoiceId);
  if (invoice.status !== "ISSUED") {
    throw new InvariantError("Credit notes can only be raised against an issued invoice.");
  }
  return invoice;
}

/** Tax lines and totals for a credit amount, from the invoice's own tax lines (SPEC §4.9). */
function computeCredit(
  invoice: {
    currency: string;
    taxLines: {
      taxType: TaxLineDto["taxType"];
      rate: Prisma.Decimal;
      taxableAmount: Prisma.Decimal;
    }[];
  },
  subtotal: string,
) {
  return creditNoteTaxLines(
    invoice.taxLines.map((t) => ({
      taxType: t.taxType,
      rate: D(t.rate.toString()),
      taxableAmount: D(t.taxableAmount.toString()),
    })),
    D(subtotal),
    invoice.currency,
  );
}

function assertAmountPositive(subtotal: string): void {
  if (D(subtotal).lte(0)) {
    throw new InvariantError("The credit amount must be greater than zero.", {
      subtotal: ["must be greater than zero"],
    });
  }
}

export async function getCreditNote(_actor: Actor, id: string): Promise<CreditNoteDto> {
  return toDto(await load(prisma, id));
}

export async function getCreditNoteTx(tx: Tx, id: string): Promise<CreditNoteDto> {
  return toDto(await load(tx, id));
}

export async function createCreditNoteDraft(
  actor: Actor,
  input: CreditNoteInput,
): Promise<CreditNoteDto> {
  assertAmountPositive(input.subtotal);
  return prisma.$transaction(async (tx) => {
    const invoice = await loadInvoiceForCredit(tx, input.invoiceId);
    const credit = computeCredit(invoice, input.subtotal);
    const c = invoice.currency;
    const row = await tx.creditNote.create({
      data: {
        issuerProfileId: invoice.issuerProfileId,
        clientId: invoice.clientId,
        invoiceId: invoice.id,
        status: "DRAFT",
        issueDate: fromDateString(input.issueDate),
        reason: input.reason,
        currency: c,
        supplyType: invoice.supplyType,
        subtotal: toMoneyString(input.subtotal, c),
        taxAmount: toMoneyString(credit.taxAmount, c),
        total: toMoneyString(credit.total, c),
        displayConfig: json(input.displayConfig ?? mergeDisplayConfig(invoice.displayConfig)),
        verificationToken: randomToken(),
        taxLines: {
          create: credit.taxLines.map((t) => ({
            taxType: t.taxType,
            rate: t.rate.toString(),
            taxableAmount: toMoneyString(t.taxableAmount, c),
            taxAmount: toMoneyString(t.taxAmount, c),
          })),
        },
      },
      select: { id: true },
    });
    await audit(tx, actor, "credit_note.created", "CreditNote", row.id, {
      summary: `Drafted a credit note of ${toMoneyString(credit.total, c)} against ${invoice.number}`,
      after: { invoiceId: invoice.id, subtotal: input.subtotal, reason: input.reason },
    });
    return toDto(await load(tx, row.id));
  });
}

export async function updateCreditNoteDraft(
  actor: Actor,
  id: string,
  input: CreditNoteInput,
): Promise<CreditNoteDto> {
  assertAmountPositive(input.subtotal);
  return prisma.$transaction(async (tx) => {
    const before = await load(tx, id);
    if (before.status !== "DRAFT")
      throw new InvariantError("An issued credit note cannot be edited.");
    const invoice = await loadInvoiceForCredit(tx, before.invoiceId);
    const credit = computeCredit(invoice, input.subtotal);
    const c = invoice.currency;
    await tx.creditNoteTaxLine.deleteMany({ where: { creditNoteId: id } });
    await tx.creditNote.update({
      where: { id },
      data: {
        issueDate: fromDateString(input.issueDate),
        reason: input.reason,
        subtotal: toMoneyString(input.subtotal, c),
        taxAmount: toMoneyString(credit.taxAmount, c),
        total: toMoneyString(credit.total, c),
        displayConfig: json(input.displayConfig ?? mergeDisplayConfig(before.displayConfig)),
        taxLines: {
          create: credit.taxLines.map((t) => ({
            taxType: t.taxType,
            rate: t.rate.toString(),
            taxableAmount: toMoneyString(t.taxableAmount, c),
            taxAmount: toMoneyString(t.taxAmount, c),
          })),
        },
      },
    });
    await audit(tx, actor, "credit_note.updated", "CreditNote", id, {
      summary: "Edited a draft credit note",
      before: { subtotal: before.subtotal.toString(), reason: before.reason },
      after: { subtotal: input.subtotal, reason: input.reason },
    });
    return toDto(await load(tx, id));
  });
}

export async function deleteCreditNoteDraft(actor: Actor, id: string): Promise<string> {
  return prisma.$transaction(async (tx) => {
    const row = await load(tx, id);
    if (row.status !== "DRAFT") throw new InvariantError("Only draft credit notes can be deleted.");
    await tx.creditNote.delete({ where: { id } });
    await audit(tx, actor, "credit_note.deleted", "CreditNote", id, {
      summary: "Deleted a draft credit note",
      before: { invoiceId: row.invoiceId, subtotal: row.subtotal.toString() },
    });
    return row.invoiceId;
  });
}

/** SPEC §4.9: own sequence, apportioned tax, capped by the invoice's outstanding amounts. */
export async function issueCreditNote(actor: Actor, id: string): Promise<CreditNoteDto> {
  return prisma.$transaction(
    async (tx) => {
      const cn = await load(tx, id);
      if (cn.status !== "DRAFT") throw new InvariantError("Only draft credit notes can be issued.");
      const invoice = await loadInvoiceForCredit(tx, cn.invoiceId);
      const c = invoice.currency;
      const credit = computeCredit(invoice, cn.subtotal.toString());
      const balances = await recalculateBalances(tx, invoice.id);
      const issuedSubtotals = await tx.creditNote.findMany({
        where: { invoiceId: invoice.id, status: "ISSUED" },
        select: { subtotal: true },
      });
      const outstandingTaxable = D(invoice.taxableAmount.toString()).minus(
        sum(issuedSubtotals.map((x) => D(x.subtotal.toString()))),
      );
      if (D(cn.subtotal.toString()).gt(outstandingTaxable)) {
        throw new InvariantError(
          `The credit amount exceeds the invoice's outstanding taxable balance of ${toMoneyString(outstandingTaxable, c)}.`,
          { subtotal: ["exceeds the outstanding taxable balance"] },
        );
      }
      if (credit.total.gt(D(balances.balanceDue))) {
        throw new InvariantError(
          `The credit note total exceeds the outstanding balance of ${toMoneyString(balances.balanceDue, c)}.`,
          { subtotal: ["total exceeds the outstanding balance"] },
        );
      }
      const profile = invoice.issuerProfile;
      const issueDate = toDateString(cn.issueDate);
      const fy = fiscalYearOf(issueDate, profile.fiscalYearStartMonth);
      const seq = await allocateDocumentNumber(tx, {
        issuerProfileId: profile.id,
        kind: "CREDIT_NOTE",
        fiscalYear: fy,
      });
      const number = formatDocumentNumber(profile.creditNoteNumberFormat, {
        date: issueDate,
        fiscalYear: fy,
        seq,
      });
      const snapshot = CreditNoteSnapshotSchema.parse({
        issuer: invoice.issuerSnapshot,
        client: invoice.clientSnapshot,
        invoice: {
          number: invoice.number,
          issueDate: toDateString(invoice.issueDate),
          currency: c,
          total: toMoneyString(invoice.total.toString(), c),
          taxRegime: invoice.taxRegime,
          placeOfSupply: invoice.placeOfSupply ?? undefined,
        },
      });
      const template = await resolveTemplateConfig(tx, profile.id);
      await tx.creditNoteTaxLine.deleteMany({ where: { creditNoteId: id } });
      await tx.creditNote.update({
        where: { id },
        data: {
          status: "ISSUED",
          number,
          fiscalYear: fy,
          sequenceNumber: seq,
          issuedAt: new Date(),
          supplyType: invoice.supplyType,
          taxAmount: toMoneyString(credit.taxAmount, c),
          total: toMoneyString(credit.total, c),
          snapshot: json(snapshot),
          templateSnapshot: json(template),
          verificationToken: randomToken(),
          taxLines: {
            create: credit.taxLines.map((t) => ({
              taxType: t.taxType,
              rate: t.rate.toString(),
              taxableAmount: toMoneyString(t.taxableAmount, c),
              taxAmount: toMoneyString(t.taxAmount, c),
            })),
          },
        },
      });
      await recalculateBalances(tx, invoice.id);
      await audit(tx, actor, "credit_note.issued", "CreditNote", id, {
        summary: `Issued ${number} (${toMoneyString(credit.total, c)}) against ${invoice.number}`,
        after: { number, total: toMoneyString(credit.total, c) },
      });
      return toDto(await load(tx, id));
    },
    { maxWait: 15_000, timeout: 30_000 },
  );
}

export async function voidCreditNote(
  actor: Actor,
  id: string,
  reason: string,
): Promise<CreditNoteDto> {
  return prisma.$transaction(async (tx) => {
    const row = await load(tx, id);
    if (row.status !== "ISSUED")
      throw new InvariantError("Only issued credit notes can be voided.");
    const trimmed = reason.trim();
    if (!trimmed)
      throw new InvariantError("A reason is required to void a credit note.", {
        reason: ["required"],
      });
    await tx.creditNote.update({
      where: { id },
      data: { status: "VOID", voidedAt: new Date(), voidReason: trimmed },
    });
    await recalculateBalances(tx, row.invoiceId); // restores the invoice balance (SPEC §4.9)
    await audit(tx, actor, "credit_note.voided", "CreditNote", id, {
      summary: `Voided ${row.number}: ${trimmed}`,
      after: { voidReason: trimmed },
    });
    return toDto(await load(tx, id));
  });
}

export async function markCreditNoteSent(actor: Actor, id: string): Promise<CreditNoteDto> {
  return prisma.$transaction(async (tx) => {
    const row = await load(tx, id);
    if (row.status !== "ISSUED")
      throw new InvariantError("Only issued credit notes can be marked as sent.");
    if (!row.sentAt) {
      await tx.creditNote.update({ where: { id }, data: { sentAt: new Date() } });
      await audit(tx, actor, "credit_note.marked_sent", "CreditNote", id, {
        summary: `Marked ${row.number} as sent`,
      });
    }
    return toDto(await load(tx, id));
  });
}

export async function setCreditNoteSentAtIfUnset(tx: Tx, id: string): Promise<void> {
  await tx.creditNote.updateMany({ where: { id, sentAt: null }, data: { sentAt: new Date() } });
}

export interface CreditNoteFilters {
  fy?: string | undefined;
  from?: DateString | undefined;
  to?: DateString | undefined;
  issuerProfileId?: string | undefined;
  clientId?: string | undefined;
  invoiceId?: string | undefined;
  status?: CreditNoteDisplayStatus | undefined;
  q?: string | undefined;
}

export async function listCreditNotes(
  _actor: Actor,
  filters: CreditNoteFilters,
): Promise<CreditNoteListRow[]> {
  const range = await resolveDateRange(filters);
  const rows = await prisma.creditNote.findMany({
    where: {
      ...(filters.issuerProfileId ? { issuerProfileId: filters.issuerProfileId } : {}),
      ...(filters.clientId ? { clientId: filters.clientId } : {}),
      ...(filters.invoiceId ? { invoiceId: filters.invoiceId } : {}),
      ...(filters.status === "DRAFT" || filters.status === "VOID"
        ? { status: filters.status }
        : filters.status
          ? { status: "ISSUED" }
          : {}),
      ...(range.from || range.to
        ? {
            issueDate: {
              ...(range.from ? { gte: fromDateString(range.from) } : {}),
              ...(range.to ? { lte: fromDateString(range.to) } : {}),
            },
          }
        : {}),
      ...(filters.q
        ? {
            OR: [
              { number: { contains: filters.q, mode: "insensitive" } },
              { reason: { contains: filters.q, mode: "insensitive" } },
              { invoice: { number: { contains: filters.q, mode: "insensitive" } } },
              { client: { displayName: { contains: filters.q, mode: "insensitive" } } },
            ],
          }
        : {}),
    },
    include: INCLUDE,
    orderBy: [{ issueDate: "desc" }, { createdAt: "desc" }],
  });
  const list = rows.map((r) => {
    const dto = toDto(r);
    return {
      id: dto.id,
      invoiceId: dto.invoiceId,
      status: dto.status,
      displayStatus: dto.displayStatus,
      number: dto.number,
      issueDate: dto.issueDate,
      currency: dto.currency,
      locale: dto.locale,
      subtotal: dto.subtotal,
      taxAmount: dto.taxAmount,
      total: dto.total,
      reason: dto.reason,
      invoiceNumber: dto.invoiceNumber,
      clientId: dto.clientId,
      clientName: dto.clientName,
      issuerProfileId: dto.issuerProfileId,
      issuerLabel: dto.issuerLabel,
    };
  });
  return filters.status ? list.filter((r) => r.displayStatus === filters.status) : list;
}

/** Default issue date for a new credit note: today in the viewer's zone. */
export function defaultCreditNoteDate(actor: Actor): DateString {
  return todayIn(actor.timezone);
}
