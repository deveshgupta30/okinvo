import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { todayIn } from "@/lib/dates";
import type { Column } from "@/lib/exports/types";
import { D, ZERO, type Decimal } from "@/lib/money";
import { PeriodExportFiltersSchema, type PeriodExportFilters } from "@/lib/schemas/export-filters";
import { resolveDateRange } from "@/server/dal/fiscal-range";
import { registerInvoices } from "./invoices";
import { clientTaxId, day, money, pct } from "./shared";
import { defineDataset } from "./types";

/**
 * GST summary (SPEC §4.11): one row per issued invoice per GST rate, laid out for GSTR-1 B2B /
 * export tables. Intra-state CGST+SGST lines at r % each fold into one row at 2r %; inter-state
 * IGST lines stand at their own rate; an invoice that carries no GST line (export under LUT,
 * reverse charge, nil-rated) still gets one row at 0 % with its taxable value, because GSTR-1
 * wants zero-rated supplies listed too. Drafts and voided invoices are not supplies and are left
 * out — the register export lists them with their status and void reason.
 */
export interface GstSummaryRow extends Record<string, string | null> {
  invoiceNumber: string | null;
  date: string;
  clientGstin: string | null;
  placeOfSupply: string | null;
  supplyType: string;
  rate: string;
  taxable: string;
  cgst: string;
  sgst: string;
  igst: string;
  total: string;
}

const COLUMNS: Column<GstSummaryRow>[] = [
  { key: "invoiceNumber", header: "Invoice number", type: "string", width: 18 },
  { key: "date", header: "Date", type: "date" },
  { key: "clientGstin", header: "Client GSTIN", type: "string", width: 18 },
  { key: "placeOfSupply", header: "Place of supply", type: "string", width: 18 },
  { key: "supplyType", header: "Supply type", type: "string", width: 16 },
  { key: "rate", header: "Rate", type: "number", numFmt: "0.00", width: 8 },
  { key: "taxable", header: "Taxable", type: "number" },
  { key: "cgst", header: "CGST", type: "number" },
  { key: "sgst", header: "SGST", type: "number" },
  { key: "igst", header: "IGST", type: "number" },
  { key: "total", header: "Total", type: "number" },
];

const INCLUDE = {
  client: { select: { taxId: true, taxIdType: true } },
  taxLines: true,
} satisfies Prisma.InvoiceInclude;

interface Bucket {
  rate: Decimal;
  taxable: Decimal;
  cgst: Decimal;
  sgst: Decimal;
  igst: Decimal;
}

/** Groups an invoice's GST lines by effective rate, ascending; empty when it has no GST line. */
export function gstBuckets(
  lines: {
    taxType: string;
    rate: Decimal.Value;
    taxableAmount: Decimal.Value;
    taxAmount: Decimal.Value;
  }[],
): Bucket[] {
  const buckets = new Map<string, Bucket>();
  for (const l of lines) {
    if (l.taxType !== "CGST" && l.taxType !== "SGST" && l.taxType !== "IGST") continue;
    const component = D(l.rate.toString());
    const rate = l.taxType === "IGST" ? component : component.mul(2);
    const key = rate.toFixed(2);
    const b = buckets.get(key) ?? {
      rate,
      taxable: D(l.taxableAmount.toString()),
      cgst: ZERO,
      sgst: ZERO,
      igst: ZERO,
    };
    const amount = D(l.taxAmount.toString());
    if (l.taxType === "CGST") b.cgst = b.cgst.plus(amount);
    else if (l.taxType === "SGST") b.sgst = b.sgst.plus(amount);
    else b.igst = b.igst.plus(amount);
    buckets.set(key, b);
  }
  return [...buckets.values()].sort((a, b) => a.rate.comparedTo(b.rate));
}

export const gstSummaryDataset = defineDataset<PeriodExportFilters, GstSummaryRow>({
  id: "gst-summary",
  title: "GST summary",
  filters: PeriodExportFiltersSchema,
  columns: COLUMNS,
  range: (f) => resolveDateRange(f),
  async *rows(actor, f, opts) {
    const today = todayIn(actor.timezone);
    const invoices = registerInvoices(f, today, opts?.pageSize, INCLUDE, {
      status: "ISSUED",
      taxRegime: "INDIA_GST",
    });
    for await (const { row: inv } of invoices) {
      const cur = inv.currency;
      const { taxId, taxIdType } = clientTaxId(inv.clientSnapshot, inv.client);
      const head = {
        invoiceNumber: inv.number,
        date: day(inv.issueDate),
        clientGstin: taxIdType === "GSTIN" ? taxId : null,
        placeOfSupply: inv.placeOfSupply,
        supplyType: inv.supplyType,
      };
      const buckets = gstBuckets(inv.taxLines);
      if (buckets.length === 0) {
        const taxable = D(inv.taxableAmount.toString());
        yield {
          ...head,
          rate: "0.00",
          taxable: money(taxable, cur) ?? "0.00",
          cgst: money(ZERO, cur) ?? "0.00",
          sgst: money(ZERO, cur) ?? "0.00",
          igst: money(ZERO, cur) ?? "0.00",
          total: money(taxable, cur) ?? "0.00",
        };
        continue;
      }
      for (const b of buckets) {
        yield {
          ...head,
          rate: pct(b.rate),
          taxable: money(b.taxable, cur) ?? "0.00",
          cgst: money(b.cgst, cur) ?? "0.00",
          sgst: money(b.sgst, cur) ?? "0.00",
          igst: money(b.igst, cur) ?? "0.00",
          total: money(b.taxable.plus(b.cgst).plus(b.sgst).plus(b.igst), cur) ?? "0.00",
        };
      }
    }
  },
});
