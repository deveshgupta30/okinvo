import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { todayIn } from "@/lib/dates";
import { prisma } from "@/lib/db";
import type { Column } from "@/lib/exports/types";
import { displayStatus } from "@/lib/invoices";
import { D, ZERO, type Decimal } from "@/lib/money";
import {
  RegisterExportFiltersSchema,
  type RegisterExportFilters,
} from "@/lib/schemas/export-filters";
import { resolveDateRange } from "@/server/dal/fiscal-range";
import { paginate } from "../paginate";
import { clientTaxId, cursorArgs, day, invoiceWhere, iso, money, plain } from "./shared";
import { defineDataset } from "./types";

export interface InvoiceRegisterRow extends Record<string, string | null> {
  number: string | null;
  status: string;
  issueDate: string;
  dueDate: string;
  issuer: string;
  client: string;
  clientTaxId: string | null;
  placeOfSupply: string | null;
  supplyType: string;
  currency: string;
  subtotal: string;
  discount: string;
  taxable: string;
  cgst: string;
  sgst: string;
  igst: string;
  vat: string;
  otherTax: string;
  rounding: string;
  total: string;
  tdsExpected: string;
  paid: string;
  credited: string;
  balance: string;
  fxRate: string;
  baseTotal: string;
  poReference: string | null;
  sentAt: string | null;
  voidReason: string | null;
}

const COLUMNS: Column<InvoiceRegisterRow>[] = [
  { key: "number", header: "Number", type: "string", width: 18 },
  { key: "status", header: "Status", type: "string", width: 14 },
  { key: "issueDate", header: "Issue date", type: "date" },
  { key: "dueDate", header: "Due date", type: "date" },
  { key: "issuer", header: "Issuer", type: "string" },
  { key: "client", header: "Client", type: "string" },
  { key: "clientTaxId", header: "Client tax ID", type: "string", width: 18 },
  { key: "placeOfSupply", header: "Place of supply", type: "string", width: 18 },
  { key: "supplyType", header: "Supply type", type: "string", width: 16 },
  { key: "currency", header: "Currency", type: "string", width: 9 },
  { key: "subtotal", header: "Subtotal", type: "number" },
  { key: "discount", header: "Discount", type: "number" },
  { key: "taxable", header: "Taxable", type: "number" },
  { key: "cgst", header: "CGST", type: "number" },
  { key: "sgst", header: "SGST", type: "number" },
  { key: "igst", header: "IGST", type: "number" },
  { key: "vat", header: "VAT", type: "number" },
  { key: "otherTax", header: "Other tax", type: "number" },
  { key: "rounding", header: "Rounding", type: "number" },
  { key: "total", header: "Total", type: "number" },
  { key: "tdsExpected", header: "TDS expected", type: "number" },
  { key: "paid", header: "Paid", type: "number" },
  { key: "credited", header: "Credited", type: "number" },
  { key: "balance", header: "Balance", type: "number" },
  { key: "fxRate", header: "FX rate", type: "number", numFmt: "0.00000000", width: 12 },
  { key: "baseTotal", header: "Base-currency total", type: "number", width: 18 },
  { key: "poReference", header: "PO ref", type: "string", width: 14 },
  { key: "sentAt", header: "Sent at", type: "datetime" },
  { key: "voidReason", header: "Void reason", type: "string", width: 30 },
];

export const INVOICE_INCLUDE = {
  client: { select: { displayName: true, taxId: true, taxIdType: true } },
  issuerProfile: { select: { legalName: true, baseCurrency: true } },
  taxLines: true,
} satisfies Prisma.InvoiceInclude;
export type InvoiceRow = Prisma.InvoiceGetPayload<{ include: typeof INVOICE_INCLUDE }>;

/** Σ tax per type; SALES_TAX and OTHER fold into "other tax". */
export function taxByType(lines: { taxType: string; taxAmount: Decimal.Value }[]) {
  const t = { cgst: ZERO, sgst: ZERO, igst: ZERO, vat: ZERO, other: ZERO };
  for (const l of lines) {
    const v = D(l.taxAmount.toString());
    if (l.taxType === "CGST") t.cgst = t.cgst.plus(v);
    else if (l.taxType === "SGST") t.sgst = t.sgst.plus(v);
    else if (l.taxType === "IGST") t.igst = t.igst.plus(v);
    else if (l.taxType === "VAT") t.vat = t.vat.plus(v);
    else t.other = t.other.plus(v);
  }
  return t;
}

type StatusFields = Pick<
  InvoiceRow,
  "status" | "sentAt" | "dueDate" | "balanceDue" | "amountPaid" | "amountCredited" | "total"
>;

export function invoiceStatus(r: StatusFields, today: string): string {
  return displayStatus(
    {
      status: r.status,
      sentAt: r.sentAt,
      dueDate: day(r.dueDate),
      balanceDue: D(r.balanceDue.toString()),
      amountPaid: D(r.amountPaid.toString()),
      amountCredited: D(r.amountCredited.toString()),
      total: D(r.total.toString()),
    },
    today,
  );
}

/**
 * Streams the register's invoices in issue-date order with the given relations, narrowed by a
 * derived-status filter. Shared by the register, line-items, GST and TDS datasets.
 */
export async function* registerInvoices<I extends Prisma.InvoiceInclude>(
  filters: Partial<RegisterExportFilters>,
  today: string,
  pageSize: number | undefined,
  include: I,
  extraWhere: Prisma.InvoiceWhereInput = {},
): AsyncGenerator<{ row: Prisma.InvoiceGetPayload<{ include: I }>; status: string }> {
  const where = { ...invoiceWhere(filters, await resolveDateRange(filters)), ...extraWhere };
  const pages = paginate(
    (cursor, take) =>
      prisma.invoice.findMany({
        where,
        include,
        orderBy: [{ issueDate: "asc" }, { id: "asc" }],
        take,
        ...cursorArgs(cursor),
      }),
    pageSize,
  );
  for await (const row of pages) {
    const status = invoiceStatus(row, today);
    if (filters.status && status !== filters.status) continue;
    yield { row, status };
  }
}

export const invoicesDataset = defineDataset<RegisterExportFilters, InvoiceRegisterRow>({
  id: "invoices",
  title: "Invoices register",
  filters: RegisterExportFiltersSchema,
  columns: COLUMNS,
  range: (f) => resolveDateRange(f),
  async *rows(actor, f, opts) {
    const today = todayIn(actor.timezone);
    for await (const { row: r, status } of registerInvoices(
      f,
      today,
      opts?.pageSize,
      INVOICE_INCLUDE,
    )) {
      const cur = r.currency;
      const base = r.issuerProfile.baseCurrency;
      const tax = taxByType(r.taxLines);
      const { taxId } = clientTaxId(r.clientSnapshot, r.client);
      yield {
        number: r.number,
        status,
        issueDate: day(r.issueDate),
        dueDate: day(r.dueDate),
        issuer: r.issuerProfile.legalName,
        client: r.client.displayName,
        clientTaxId: taxId,
        placeOfSupply: r.placeOfSupply,
        supplyType: r.supplyType,
        currency: cur,
        subtotal: money(r.subtotal, cur) ?? "0.00",
        discount: money(r.discountAmount, cur) ?? "0.00",
        taxable: money(r.taxableAmount, cur) ?? "0.00",
        cgst: money(tax.cgst, cur) ?? "0.00",
        sgst: money(tax.sgst, cur) ?? "0.00",
        igst: money(tax.igst, cur) ?? "0.00",
        vat: money(tax.vat, cur) ?? "0.00",
        otherTax: money(tax.other, cur) ?? "0.00",
        rounding: money(r.roundingAdjustment, cur) ?? "0.00",
        total: money(r.total, cur) ?? "0.00",
        tdsExpected: money(r.tdsExpected, cur) ?? "0.00",
        paid: money(r.amountPaid, cur) ?? "0.00",
        credited: money(r.amountCredited, cur) ?? "0.00",
        balance: money(r.balanceDue, cur) ?? "0.00",
        fxRate: plain(r.fxRateToBase) ?? "1",
        baseTotal: money(D(r.total.toString()).mul(D(r.fxRateToBase.toString())), base) ?? "0.00",
        poReference: r.poReference,
        sentAt: iso(r.sentAt),
        voidReason: r.voidReason,
      };
    }
  },
});
