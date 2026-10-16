import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { todayIn } from "@/lib/dates";
import type { Column } from "@/lib/exports/types";
import { D, ZERO, type Decimal } from "@/lib/money";
import { PeriodExportFiltersSchema, type PeriodExportFilters } from "@/lib/schemas/export-filters";
import { resolveDateRange } from "@/server/dal/fiscal-range";
import { registerInvoices } from "./invoices";
import { clientTaxId, int, money, panFromGstin } from "./shared";
import { defineDataset } from "./types";

/**
 * TDS summary (SPEC §4.11): one row per client (and currency, when a client was billed in more
 * than one) over the issued invoices of the period: how many, taxable billed, TDS the issuer
 * expected, and TDS the client actually deducted on the payments recorded against those invoices -
 * attributed to the invoice's period, not the payment date, which is how Form 26AS is reconciled.
 * The PAN is read out of a GSTIN; any other tax ID is shown as is.
 */
export interface TdsSummaryRow extends Record<string, string | null> {
  client: string;
  panOrTaxId: string | null;
  currency: string;
  invoices: string;
  taxableBilled: string;
  tdsExpected: string;
  tdsDeducted: string;
}

const COLUMNS: Column<TdsSummaryRow>[] = [
  { key: "client", header: "Client", type: "string" },
  { key: "panOrTaxId", header: "PAN / tax ID", type: "string", width: 18 },
  { key: "currency", header: "Currency", type: "string", width: 9 },
  { key: "invoices", header: "Invoices", type: "number", numFmt: "0", width: 10 },
  { key: "taxableBilled", header: "Taxable billed", type: "number", width: 16 },
  { key: "tdsExpected", header: "TDS expected", type: "number" },
  { key: "tdsDeducted", header: "TDS deducted", type: "number" },
];

const INCLUDE = {
  client: { select: { displayName: true, taxId: true, taxIdType: true } },
  payments: { select: { tdsDeducted: true } },
} satisfies Prisma.InvoiceInclude;

interface Acc {
  client: string;
  panOrTaxId: string | null;
  currency: string;
  invoices: number;
  taxable: Decimal;
  tdsExpected: Decimal;
  tdsDeducted: Decimal;
}

export const tdsSummaryDataset = defineDataset<PeriodExportFilters, TdsSummaryRow>({
  id: "tds-summary",
  title: "TDS summary",
  filters: PeriodExportFiltersSchema,
  columns: COLUMNS,
  range: (f) => resolveDateRange(f),
  async *rows(actor, f, opts) {
    const today = todayIn(actor.timezone);
    const acc = new Map<string, Acc>();
    const invoices = registerInvoices(f, today, opts?.pageSize, INCLUDE, { status: "ISSUED" });
    for await (const { row: inv } of invoices) {
      const key = `${inv.clientId}\u0000${inv.currency}`;
      let a = acc.get(key);
      if (!a) {
        const { taxId, taxIdType } = clientTaxId(inv.clientSnapshot, inv.client);
        a = {
          client: inv.client.displayName,
          panOrTaxId: panFromGstin(taxId, taxIdType) ?? taxId,
          currency: inv.currency,
          invoices: 0,
          taxable: ZERO,
          tdsExpected: ZERO,
          tdsDeducted: ZERO,
        };
        acc.set(key, a);
      }
      a.invoices += 1;
      a.taxable = a.taxable.plus(D(inv.taxableAmount.toString()));
      a.tdsExpected = a.tdsExpected.plus(D(inv.tdsExpected.toString()));
      for (const p of inv.payments) a.tdsDeducted = a.tdsDeducted.plus(D(p.tdsDeducted.toString()));
    }
    const rows = [...acc.values()].sort(
      (x, y) => x.client.localeCompare(y.client) || x.currency.localeCompare(y.currency),
    );
    for (const a of rows) {
      yield {
        client: a.client,
        panOrTaxId: a.panOrTaxId,
        currency: a.currency,
        invoices: int(a.invoices),
        taxableBilled: money(a.taxable, a.currency) ?? "0.00",
        tdsExpected: money(a.tdsExpected, a.currency) ?? "0.00",
        tdsDeducted: money(a.tdsDeducted, a.currency) ?? "0.00",
      };
    }
  },
});
