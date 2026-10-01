import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { randomToken } from "@/lib/crypto";
import {
  addDays,
  compareDates,
  fromDateString,
  todayIn,
  toDateString,
  type DateString,
} from "@/lib/dates";
import { prisma, type Tx } from "@/lib/db";
import { displayStatus, type DisplayStatus } from "@/lib/invoices";
import { computeInvoice, placeOfSupplyFor, type Computed } from "@/lib/invoices/compute";
import { recalculateBalances } from "@/lib/invoices/balances";
import { buildSnapshots } from "@/lib/invoices/snapshots";
import { validateForIssue } from "@/lib/invoices/validate-for-issue";
import { D, toMoneyString, type Decimal } from "@/lib/money";
import { fiscalYearOf, formatDocumentNumber } from "@/lib/numbering";
import { allocateDocumentNumber } from "@/lib/numbering/allocate";
import {
  mergeDisplayConfig,
  mergeTemplateConfig,
  paymentMethodLines,
  type Address,
  type ClientSnapshot,
  type DisplayConfig,
  type IssuerSnapshot,
  type PaymentMethodsSnapshot,
  type TemplateConfig,
} from "@/lib/schemas";
import type { InvoiceDraftInput, InvoiceFilters } from "@/lib/schemas/invoice-input";
import type { SupplyType, TaxRegime } from "@/lib/tax";
import type { Actor } from "@/server/actor";
import { audit } from "./audit";
import { InvariantError, NotFoundError } from "./errors";
import { resolveDateRange } from "./fiscal-range";
import { decryptDetails } from "./payment-methods";
import { resolveTemplateConfig } from "./templates";

// ───────────────────────── DTOs ─────────────────────────

export interface InvoiceItemDto {
  id: string;
  position: number;
  serviceItemId: string | null;
  description: string;
  sacHsnCode: string | null;
  unitType: "HOUR" | "DAY" | "FIXED" | "MILESTONE" | "UNIT";
  quantity: string;
  unitPrice: string;
  lineSubtotal: string;
  taxRate: string;
  taxAmount: string;
  lineTotal: string;
}

export interface TaxLineDto {
  taxType: "CGST" | "SGST" | "IGST" | "VAT" | "SALES_TAX" | "OTHER";
  rate: string;
  taxableAmount: string;
  taxAmount: string;
}

export interface InvoiceListRow {
  id: string;
  status: "DRAFT" | "ISSUED" | "VOID";
  displayStatus: DisplayStatus;
  number: string | null;
  issueDate: DateString;
  dueDate: DateString;
  currency: string;
  total: string;
  balanceDue: string;
  clientId: string;
  clientName: string;
  issuerProfileId: string;
  issuerLabel: string;
  locale: string;
  sentAt: string | null;
}

export interface InvoiceDto extends InvoiceListRow {
  fiscalYear: string | null;
  sequenceNumber: number | null;
  issuedAt: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  replacesInvoiceId: string | null;
  replaces: { id: string; number: string | null } | null;
  replacedById: string | null;
  replacedBy: { id: string; number: string | null; status: string } | null;
  fxRateToBase: string;
  taxRegime: TaxRegime;
  supplyType: SupplyType;
  placeOfSupply: string | null;
  isReverseCharge: boolean;
  lutNumber: string | null;
  subtotal: string;
  discountType: "AMOUNT" | "PERCENT" | null;
  discountValue: string | null;
  discountAmount: string;
  taxableAmount: string;
  taxAmount: string;
  roundingAdjustment: string;
  tdsRate: string;
  tdsExpected: string;
  amountPaid: string;
  amountCredited: string;
  poReference: string | null;
  notes: string | null;
  terms: string | null;
  displayConfig: DisplayConfig;
  templateSnapshot: TemplateConfig | null;
  issuerSnapshot: IssuerSnapshot | null;
  clientSnapshot: ClientSnapshot | null;
  paymentMethodsSnapshot: PaymentMethodsSnapshot | null;
  verificationToken: string;
  items: InvoiceItemDto[];
  taxLines: TaxLineDto[];
  paymentMethodIds: string[];
  issuer: {
    id: string;
    label: string;
    legalName: string;
    locale: string;
    baseCurrency: string;
    fiscalYearStartMonth: number;
    gstin: string | null;
  };
  client: { id: string; displayName: string; email: string | null; paymentTermsDays: number };
  documents: {
    id: string;
    version: number;
    sha256: string;
    byteSize: number;
    generatedAt: string;
  }[];
  paymentsCount: number;
  creditNotes: {
    id: string;
    number: string | null;
    status: "DRAFT" | "ISSUED" | "VOID";
    total: string;
    issueDate: DateString;
  }[];
  createdAt: string;
  updatedAt: string;
}

// ───────────────────────── Prisma shapes ─────────────────────────

const DETAIL_INCLUDE = {
  items: { orderBy: { position: "asc" } },
  taxLines: { orderBy: [{ taxType: "asc" }, { rate: "asc" }] },
  paymentMethods: { orderBy: { position: "asc" } },
  issuerProfile: {
    select: {
      id: true,
      label: true,
      legalName: true,
      locale: true,
      baseCurrency: true,
      fiscalYearStartMonth: true,
      gstin: true,
    },
  },
  client: { select: { id: true, displayName: true, email: true, paymentTermsDays: true } },
  replacesInvoice: { select: { id: true, number: true } },
  replacedBy: { select: { id: true, number: true, status: true } },
  documents: { orderBy: { version: "asc" } },
  creditNotes: {
    select: { id: true, number: true, status: true, total: true, issueDate: true, currency: true },
    orderBy: { createdAt: "asc" },
  },
  _count: { select: { payments: true } },
} satisfies Prisma.InvoiceInclude;

type DetailRow = Prisma.InvoiceGetPayload<{ include: typeof DETAIL_INCLUDE }>;

const json = (v: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;

const money = (v: Decimal | Prisma.Decimal | string, currency: string) =>
  toMoneyString(D(v.toString()), currency);

function toDto(row: DetailRow, today: DateString): InvoiceDto {
  const c = row.currency;
  const status = displayStatus(
    {
      status: row.status,
      sentAt: row.sentAt,
      dueDate: toDateString(row.dueDate),
      balanceDue: D(row.balanceDue.toString()),
      amountPaid: D(row.amountPaid.toString()),
      amountCredited: D(row.amountCredited.toString()),
      total: D(row.total.toString()),
    },
    today,
  );
  return {
    id: row.id,
    status: row.status,
    displayStatus: status,
    number: row.number,
    fiscalYear: row.fiscalYear,
    sequenceNumber: row.sequenceNumber,
    issueDate: toDateString(row.issueDate),
    dueDate: toDateString(row.dueDate),
    issuedAt: row.issuedAt?.toISOString() ?? null,
    sentAt: row.sentAt?.toISOString() ?? null,
    voidedAt: row.voidedAt?.toISOString() ?? null,
    voidReason: row.voidReason,
    replacesInvoiceId: row.replacesInvoiceId,
    replaces: row.replacesInvoice,
    replacedById: row.replacedBy?.id ?? null,
    replacedBy: row.replacedBy,
    currency: c,
    fxRateToBase: D(row.fxRateToBase.toString()).toString(),
    taxRegime: row.taxRegime,
    supplyType: row.supplyType,
    placeOfSupply: row.placeOfSupply,
    isReverseCharge: row.isReverseCharge,
    lutNumber: row.lutNumber,
    subtotal: money(row.subtotal, c),
    discountType: row.discountType,
    discountValue: row.discountValue ? money(row.discountValue, c) : null,
    discountAmount: money(row.discountAmount, c),
    taxableAmount: money(row.taxableAmount, c),
    taxAmount: money(row.taxAmount, c),
    roundingAdjustment: money(row.roundingAdjustment, c),
    total: money(row.total, c),
    tdsRate: D(row.tdsRate.toString()).toString(),
    tdsExpected: money(row.tdsExpected, c),
    amountPaid: money(row.amountPaid, c),
    amountCredited: money(row.amountCredited, c),
    balanceDue: money(row.balanceDue, c),
    poReference: row.poReference,
    notes: row.notes,
    terms: row.terms,
    displayConfig: mergeDisplayConfig(row.displayConfig),
    templateSnapshot: row.templateSnapshot ? mergeTemplateConfig(row.templateSnapshot) : null,
    issuerSnapshot: (row.issuerSnapshot as IssuerSnapshot | null) ?? null,
    clientSnapshot: (row.clientSnapshot as ClientSnapshot | null) ?? null,
    paymentMethodsSnapshot: (row.paymentMethodsSnapshot as PaymentMethodsSnapshot | null) ?? null,
    verificationToken: row.verificationToken,
    items: row.items.map((i) => ({
      id: i.id,
      position: i.position,
      serviceItemId: i.serviceItemId,
      description: i.description,
      sacHsnCode: i.sacHsnCode,
      unitType: i.unitType,
      quantity: D(i.quantity.toString()).toFixed(3),
      unitPrice: money(i.unitPrice, c),
      lineSubtotal: money(i.lineSubtotal, c),
      taxRate: D(i.taxRate.toString()).toString(),
      taxAmount: money(i.taxAmount, c),
      lineTotal: money(i.lineTotal, c),
    })),
    taxLines: row.taxLines.map((t) => ({
      taxType: t.taxType,
      rate: D(t.rate.toString()).toString(),
      taxableAmount: money(t.taxableAmount, c),
      taxAmount: money(t.taxAmount, c),
    })),
    paymentMethodIds: row.paymentMethods.map((pm) => pm.paymentMethodProfileId),
    clientId: row.clientId,
    clientName: row.client.displayName,
    issuerProfileId: row.issuerProfileId,
    issuerLabel: row.issuerProfile.label,
    locale: row.issuerProfile.locale,
    issuer: row.issuerProfile,
    client: row.client,
    documents: row.documents.map((d) => ({
      id: d.id,
      version: d.version,
      sha256: d.sha256,
      byteSize: d.byteSize,
      generatedAt: d.generatedAt.toISOString(),
    })),
    paymentsCount: row._count.payments,
    creditNotes: row.creditNotes.map((cn) => ({
      id: cn.id,
      number: cn.number,
      status: cn.status,
      total: money(cn.total, cn.currency),
      issueDate: toDateString(cn.issueDate),
    })),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// ───────────────────────── computation (shared with the live preview) ─────────────────────────

function totalsData(c: Computed, currency: string) {
  const t = c.totals;
  return {
    supplyType: c.tax.supplyType,
    subtotal: toMoneyString(t.subtotal, currency),
    discountAmount: toMoneyString(t.discountAmount, currency),
    taxableAmount: toMoneyString(t.taxableAmount, currency),
    taxAmount: toMoneyString(t.taxAmount, currency),
    roundingAdjustment: toMoneyString(t.roundingAdjustment, currency),
    total: toMoneyString(t.total, currency),
    tdsExpected: toMoneyString(t.tdsExpected, currency),
  };
}

function taxLinesCreate(c: Computed, currency: string) {
  return c.tax.taxLines.map((t) => ({
    taxType: t.taxType,
    rate: t.rate.toString(),
    taxableAmount: toMoneyString(t.taxableAmount, currency),
    taxAmount: toMoneyString(t.taxAmount, currency),
  }));
}

function itemsCreate(input: InvoiceDraftInput, c: Computed) {
  return input.items.map((it, idx) => {
    const position = idx + 1;
    const line = c.totals.items.find((l) => l.position === position);
    if (!line) throw new Error(`no computed line for position ${position}`);
    return {
      position,
      serviceItemId: it.serviceItemId ?? null,
      description: it.description,
      sacHsnCode: it.sacHsnCode ?? null,
      unitType: it.unitType,
      quantity: it.quantity,
      unitPrice: it.unitPrice,
      lineSubtotal: toMoneyString(line.lineSubtotal, input.currency),
      taxRate: it.taxRate,
      taxAmount: toMoneyString(line.taxAmount, input.currency),
      lineTotal: toMoneyString(line.lineTotal, input.currency),
    };
  });
}

// ───────────────────────── loaders ─────────────────────────

async function loadDetail(tx: Tx, id: string): Promise<DetailRow> {
  const row = await tx.invoice.findUnique({ where: { id }, include: DETAIL_INCLUDE });
  if (!row) throw new NotFoundError("Invoice", id);
  return row;
}

async function loadParties(tx: Tx, input: InvoiceDraftInput) {
  const [issuer, client] = await Promise.all([
    tx.issuerProfile.findUnique({ where: { id: input.issuerProfileId } }),
    tx.client.findUnique({ where: { id: input.clientId } }),
  ]);
  if (!issuer) throw new NotFoundError("Issuer profile", input.issuerProfileId);
  if (!client) throw new NotFoundError("Client", input.clientId);
  if (issuer.archivedAt) throw new InvariantError("That issuer profile is archived.");
  if (client.archivedAt) throw new InvariantError("That client is archived.");
  if (input.paymentMethodIds.length > 0) {
    const found = await tx.paymentMethodProfile.count({
      where: { id: { in: input.paymentMethodIds } },
    });
    if (found !== new Set(input.paymentMethodIds).size) {
      throw new InvariantError("One of the selected payment methods no longer exists.");
    }
  }
  return { issuer, client };
}

function draftData(input: InvoiceDraftInput, c: Computed, placeOfSupply: string | null) {
  return {
    issuerProfileId: input.issuerProfileId,
    clientId: input.clientId,
    issueDate: fromDateString(input.issueDate),
    dueDate: fromDateString(input.dueDate),
    currency: input.currency,
    fxRateToBase: input.fxRateToBase,
    taxRegime: input.taxRegime,
    placeOfSupply,
    isReverseCharge: input.isReverseCharge,
    discountType: input.discount?.type ?? null,
    discountValue: input.discount?.value ?? null,
    tdsRate: input.tdsRate,
    poReference: input.poReference ?? null,
    notes: input.notes ?? null,
    terms: input.terms ?? null,
    displayConfig: json(input.displayConfig),
    ...totalsData(c, input.currency),
    balanceDue: toMoneyString(c.totals.total, input.currency),
    items: { create: itemsCreate(input, c) },
    taxLines: { create: taxLinesCreate(c, input.currency) },
    paymentMethods: {
      create: input.paymentMethodIds.map((id, i) => ({
        paymentMethodProfileId: id,
        position: i + 1,
      })),
    },
  };
}

// ───────────────────────── public API ─────────────────────────

export async function getInvoice(actor: Actor, id: string): Promise<InvoiceDto> {
  return toDto(await loadDetail(prisma, id), todayIn(actor.timezone));
}

/** Internal loader for other DAL modules (documents, emails) that already hold a transaction. */
export async function getInvoiceTx(tx: Tx, id: string, today: DateString): Promise<InvoiceDto> {
  return toDto(await loadDetail(tx, id), today);
}

export async function createDraft(actor: Actor, input: InvoiceDraftInput): Promise<InvoiceDto> {
  return prisma.$transaction(async (tx) => {
    const { issuer, client } = await loadParties(tx, input);
    const fy = fiscalYearOf(input.issueDate, issuer.fiscalYearStartMonth);
    const c = computeInvoice(
      {
        ...input,
        fiscalYear: fy,
        discount: input.discount ?? null,
        roundingAdjustment: input.roundingAdjustment ?? null,
        items: input.items.map((it, i) => ({ ...it, position: i + 1 })),
      },
      issuer,
      client,
    );
    const row = await tx.invoice.create({
      data: {
        ...draftData(input, c, placeOfSupplyFor(input.taxRegime, client)),
        status: "DRAFT",
        verificationToken: randomToken(),
      },
      select: { id: true },
    });
    await audit(tx, actor, "invoice.created", "Invoice", row.id, {
      summary: "Created a draft invoice",
      after: { clientId: input.clientId, total: toMoneyString(c.totals.total, input.currency) },
    });
    return toDto(await loadDetail(tx, row.id), todayIn(actor.timezone));
  });
}

function assertDraft(row: { status: string; number: string | null }, verb: string): void {
  if (row.status !== "DRAFT") {
    throw new InvariantError(
      `An issued invoice${row.number ? ` (${row.number})` : ""} cannot be ${verb}; void it and reissue instead.`,
    );
  }
}

export async function updateDraft(
  actor: Actor,
  id: string,
  input: InvoiceDraftInput,
): Promise<InvoiceDto> {
  return prisma.$transaction(async (tx) => {
    const before = await loadDetail(tx, id);
    assertDraft(before, "edited");
    const { issuer, client } = await loadParties(tx, input);
    const fy = fiscalYearOf(input.issueDate, issuer.fiscalYearStartMonth);
    const c = computeInvoice(
      {
        ...input,
        fiscalYear: fy,
        discount: input.discount ?? null,
        roundingAdjustment: input.roundingAdjustment ?? null,
        items: input.items.map((it, i) => ({ ...it, position: i + 1 })),
      },
      issuer,
      client,
    );
    await tx.invoiceItem.deleteMany({ where: { invoiceId: id } });
    await tx.invoiceTaxLine.deleteMany({ where: { invoiceId: id } });
    await tx.invoicePaymentMethod.deleteMany({ where: { invoiceId: id } });
    await tx.invoice.update({
      where: { id },
      data: draftData(input, c, placeOfSupplyFor(input.taxRegime, client)),
    });
    await audit(tx, actor, "invoice.updated", "Invoice", id, {
      summary: "Edited a draft invoice",
      before: { total: money(before.total, before.currency), items: before.items.length },
      after: { total: toMoneyString(c.totals.total, input.currency), items: input.items.length },
    });
    return toDto(await loadDetail(tx, id), todayIn(actor.timezone));
  });
}

export async function deleteDraft(actor: Actor, id: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const row = await loadDetail(tx, id);
    assertDraft(row, "deleted");
    await tx.invoice.delete({ where: { id } });
    await audit(tx, actor, "invoice.deleted", "Invoice", id, {
      summary: "Deleted a draft invoice",
      before: { clientId: row.clientId, total: money(row.total, row.currency) },
    });
  });
}

/** SPEC §4.6: number, snapshots, tax lines and totals are fixed in one transaction. */
export async function issueInvoice(actor: Actor, id: string): Promise<InvoiceDto> {
  return prisma.$transaction(
    async (tx) => {
      const draft = await tx.invoice.findUnique({
        where: { id },
        include: {
          items: { orderBy: { position: "asc" } },
          issuerProfile: true,
          client: true,
          paymentMethods: { include: { paymentMethod: true }, orderBy: { position: "asc" } },
        },
      });
      if (!draft) throw new NotFoundError("Invoice", id);
      if (draft.status !== "DRAFT") throw new InvariantError("Only drafts can be issued.");
      const issuer = draft.issuerProfile;
      const client = draft.client;
      const issueDate = toDateString(draft.issueDate);
      const fy = fiscalYearOf(issueDate, issuer.fiscalYearStartMonth);
      const errors = validateForIssue({
        taxRegime: draft.taxRegime,
        issueDate,
        dueDate: toDateString(draft.dueDate),
        isReverseCharge: draft.isReverseCharge,
        items: draft.items.map((i) => ({
          position: i.position,
          description: i.description,
          sacHsnCode: i.sacHsnCode,
        })),
        issuer: {
          countryCode: issuer.countryCode,
          gstin: issuer.gstin,
          gstStateCode: issuer.gstStateCode,
        },
        client: {
          countryCode: client.countryCode,
          gstStateCode: client.gstStateCode,
          email: client.email,
        },
      });
      if (errors.length > 0) throw new InvariantError(errors.join(" "), { _form: errors });

      const c = computeInvoice(
        {
          currency: draft.currency,
          items: draft.items.map((i) => ({
            position: i.position,
            quantity: i.quantity.toString(),
            unitPrice: i.unitPrice.toString(),
            taxRate: i.taxRate.toString(),
          })),
          discount:
            draft.discountType && draft.discountValue
              ? { type: draft.discountType, value: draft.discountValue.toString() }
              : null,
          roundingAdjustment: draft.roundingAdjustment.toString(),
          tdsRate: draft.tdsRate.toString(),
          taxRegime: draft.taxRegime,
          isReverseCharge: draft.isReverseCharge,
          fiscalYear: fy,
        },
        issuer,
        client,
      );
      const seq = await allocateDocumentNumber(tx, {
        issuerProfileId: issuer.id,
        kind: "INVOICE",
        fiscalYear: fy,
      });
      const number = formatDocumentNumber(issuer.invoiceNumberFormat, {
        date: issueDate,
        fiscalYear: fy,
        seq,
      });
      const display = mergeDisplayConfig(draft.displayConfig);
      const snap = buildSnapshots({
        issuer: { ...issuer, address: issuer.address as Address },
        client: {
          ...client,
          billingAddress: client.billingAddress as Address,
          shippingAddress: (client.shippingAddress as Address | null) ?? null,
        },
        methods: draft.paymentMethods.map((pm) => ({
          name: pm.paymentMethod.name,
          type: pm.paymentMethod.type,
          instructions: pm.paymentMethod.instructions,
          lines: paymentMethodLines(decryptDetails(pm.paymentMethod.detailsEnc)),
        })),
        display,
        lutApplies: c.tax.supplyType === "EXPORT_LUT",
      });
      const template = await resolveTemplateConfig(tx, issuer.id);
      await tx.invoice.update({
        where: { id },
        data: {
          status: "ISSUED",
          number,
          fiscalYear: fy,
          sequenceNumber: seq,
          issuedAt: new Date(),
          placeOfSupply: placeOfSupplyFor(draft.taxRegime, client),
          lutNumber: c.tax.supplyType === "EXPORT_LUT" ? issuer.lutNumber : null,
          ...totalsData(c, draft.currency),
          verificationToken: randomToken(),
          issuerSnapshot: json(snap.issuer),
          clientSnapshot: json(snap.client),
          paymentMethodsSnapshot: json(snap.paymentMethods),
          templateSnapshot: json(template),
          taxLines: { deleteMany: {}, create: taxLinesCreate(c, draft.currency) },
        },
      });
      for (const line of c.totals.items) {
        await tx.invoiceItem.update({
          where: { invoiceId_position: { invoiceId: id, position: line.position } },
          data: {
            lineSubtotal: toMoneyString(line.lineSubtotal, draft.currency),
            taxAmount: toMoneyString(line.taxAmount, draft.currency),
            lineTotal: toMoneyString(line.lineTotal, draft.currency),
          },
        });
      }
      await recalculateBalances(tx, id);
      await audit(tx, actor, "invoice.issued", "Invoice", id, {
        summary: `Issued ${number}`,
        after: { number, total: toMoneyString(c.totals.total, draft.currency) },
      });
      return toDto(await loadDetail(tx, id), todayIn(actor.timezone));
    },
    { maxWait: 15_000, timeout: 30_000 },
  );
}

async function voidInTx(tx: Tx, actor: Actor, id: string, reason: string): Promise<DetailRow> {
  const row = await loadDetail(tx, id);
  if (row.status !== "ISSUED") throw new InvariantError("Only issued invoices can be voided.");
  if (row._count.payments > 0) {
    throw new InvariantError(
      "This invoice has payments recorded; issue a credit note instead of voiding it.",
    );
  }
  const trimmed = reason.trim();
  if (!trimmed)
    throw new InvariantError("A reason is required to void an invoice.", { reason: ["required"] });
  await tx.invoice.update({
    where: { id },
    data: { status: "VOID", voidedAt: new Date(), voidReason: trimmed },
  });
  await audit(tx, actor, "invoice.voided", "Invoice", id, {
    summary: `Voided ${row.number}: ${trimmed}`,
    after: { voidReason: trimmed },
  });
  return row;
}

export async function voidInvoice(actor: Actor, id: string, reason: string): Promise<InvoiceDto> {
  return prisma.$transaction(async (tx) => {
    await voidInTx(tx, actor, id, reason);
    return toDto(await loadDetail(tx, id), todayIn(actor.timezone));
  });
}

/** Void the original and open a linked draft with the same content, dated today (SPEC §4.6). */
export async function voidAndReissue(actor: Actor, id: string, reason: string): Promise<string> {
  return prisma.$transaction(async (tx) => {
    const old = await voidInTx(tx, actor, id, reason);
    const today = todayIn(actor.timezone);
    const termDays = Math.max(
      0,
      Math.round((old.dueDate.getTime() - old.issueDate.getTime()) / 86_400_000),
    );
    const created = await tx.invoice.create({
      data: {
        issuerProfileId: old.issuerProfileId,
        clientId: old.clientId,
        status: "DRAFT",
        issueDate: fromDateString(today),
        dueDate: fromDateString(addDays(today, termDays)),
        currency: old.currency,
        fxRateToBase: old.fxRateToBase,
        taxRegime: old.taxRegime,
        supplyType: old.supplyType,
        placeOfSupply: old.placeOfSupply,
        isReverseCharge: old.isReverseCharge,
        discountType: old.discountType,
        discountValue: old.discountValue,
        roundingAdjustment: old.roundingAdjustment,
        tdsRate: old.tdsRate,
        subtotal: old.subtotal,
        discountAmount: old.discountAmount,
        taxableAmount: old.taxableAmount,
        taxAmount: old.taxAmount,
        total: old.total,
        tdsExpected: old.tdsExpected,
        balanceDue: old.total,
        poReference: old.poReference,
        notes: old.notes,
        terms: old.terms,
        displayConfig: old.displayConfig as Prisma.InputJsonValue,
        replacesInvoiceId: old.id,
        verificationToken: randomToken(),
        items: {
          create: old.items.map((i) => ({
            position: i.position,
            serviceItemId: i.serviceItemId,
            description: i.description,
            sacHsnCode: i.sacHsnCode,
            unitType: i.unitType,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
            lineSubtotal: i.lineSubtotal,
            taxRate: i.taxRate,
            taxAmount: i.taxAmount,
            lineTotal: i.lineTotal,
          })),
        },
        taxLines: {
          create: old.taxLines.map((t) => ({
            taxType: t.taxType,
            rate: t.rate,
            taxableAmount: t.taxableAmount,
            taxAmount: t.taxAmount,
          })),
        },
        paymentMethods: {
          create: old.paymentMethods.map((pm) => ({
            paymentMethodProfileId: pm.paymentMethodProfileId,
            position: pm.position,
          })),
        },
      },
      select: { id: true },
    });
    await audit(tx, actor, "invoice.reissued", "Invoice", old.id, {
      summary: `Reissued ${old.number} as a new draft`,
      after: { replacedBy: created.id },
    });
    await audit(tx, actor, "invoice.created", "Invoice", created.id, {
      summary: `Draft created to replace ${old.number}`,
      after: { replaces: old.id },
    });
    return created.id;
  });
}

export async function markSent(actor: Actor, id: string): Promise<InvoiceDto> {
  return prisma.$transaction(async (tx) => {
    const row = await loadDetail(tx, id);
    if (row.status !== "ISSUED")
      throw new InvariantError("Only issued invoices can be marked as sent.");
    if (!row.sentAt) {
      await tx.invoice.update({ where: { id }, data: { sentAt: new Date() } });
      await audit(tx, actor, "invoice.marked_sent", "Invoice", id, {
        summary: `Marked ${row.number} as sent`,
      });
    }
    return toDto(await loadDetail(tx, id), todayIn(actor.timezone));
  });
}

/** First successful email send sets sentAt (SPEC §4.16); idempotent. */
export async function setSentAtIfUnset(tx: Tx, id: string): Promise<void> {
  await tx.invoice.updateMany({ where: { id, sentAt: null }, data: { sentAt: new Date() } });
}

// ───────────────────────── register ─────────────────────────

export const INVOICE_PAGE_SIZE = 50;

export async function listInvoices(
  actor: Actor,
  filters: Partial<InvoiceFilters>,
): Promise<InvoiceListRow[]> {
  const today = todayIn(actor.timezone);
  const range = await resolveDateRange(filters);
  const rows = await prisma.invoice.findMany({
    where: {
      ...(filters.issuerProfileId ? { issuerProfileId: filters.issuerProfileId } : {}),
      ...(filters.clientId ? { clientId: filters.clientId } : {}),
      ...(filters.currency ? { currency: filters.currency } : {}),
      ...(filters.status === "DRAFT" || filters.status === "VOID"
        ? { status: filters.status }
        : {}),
      ...(filters.status && filters.status !== "DRAFT" && filters.status !== "VOID"
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
              { poReference: { contains: filters.q, mode: "insensitive" } },
              { client: { displayName: { contains: filters.q, mode: "insensitive" } } },
            ],
          }
        : {}),
    },
    include: {
      client: { select: { displayName: true } },
      issuerProfile: { select: { label: true, locale: true } },
    },
    orderBy: [{ issueDate: "desc" }, { createdAt: "desc" }],
  });
  const list = rows.map((r) => ({
    id: r.id,
    status: r.status,
    displayStatus: displayStatus(
      {
        status: r.status,
        sentAt: r.sentAt,
        dueDate: toDateString(r.dueDate),
        balanceDue: D(r.balanceDue.toString()),
        amountPaid: D(r.amountPaid.toString()),
        amountCredited: D(r.amountCredited.toString()),
        total: D(r.total.toString()),
      },
      today,
    ),
    number: r.number,
    issueDate: toDateString(r.issueDate),
    dueDate: toDateString(r.dueDate),
    currency: r.currency,
    total: money(r.total, r.currency),
    balanceDue: money(r.balanceDue, r.currency),
    clientId: r.clientId,
    clientName: r.client.displayName,
    issuerProfileId: r.issuerProfileId,
    issuerLabel: r.issuerProfile.label,
    locale: r.issuerProfile.locale,
    sentAt: r.sentAt?.toISOString() ?? null,
  }));
  // Derived statuses (PAID, OVERDUE, …) depend on "today" in the viewer's zone, so filter here.
  return filters.status ? list.filter((r) => r.displayStatus === filters.status) : list;
}

/** Fiscal-year labels present in the register, newest first (for the filter bar). */
export async function invoiceFiscalYears(startMonth: number): Promise<string[]> {
  const rows = await prisma.invoice.findMany({
    select: { issueDate: true },
    orderBy: { issueDate: "desc" },
    distinct: ["issueDate"],
  });
  const years = new Set<string>();
  for (const r of rows) years.add(fiscalYearOf(toDateString(r.issueDate), startMonth));
  return [...years].sort((a, b) => compareDates(b, a));
}
