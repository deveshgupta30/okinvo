import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { todayIn } from "@/lib/dates";
import type { Column } from "@/lib/exports/types";
import {
  RegisterExportFiltersSchema,
  type RegisterExportFilters,
} from "@/lib/schemas/export-filters";
import { resolveDateRange } from "@/server/dal/fiscal-range";
import { registerInvoices } from "./invoices";
import { day, int, money, pct, qty } from "./shared";
import { defineDataset } from "./types";

export interface InvoiceItemRow extends Record<string, string | null> {
  invoiceNumber: string | null;
  issueDate: string;
  client: string;
  position: string;
  description: string;
  sku: string | null;
  sacHsnCode: string | null;
  unit: string;
  quantity: string;
  rate: string;
  lineSubtotal: string;
  taxRate: string;
  taxAmount: string;
  lineTotal: string;
}

const COLUMNS: Column<InvoiceItemRow>[] = [
  { key: "invoiceNumber", header: "Invoice number", type: "string", width: 18 },
  { key: "issueDate", header: "Issue date", type: "date" },
  { key: "client", header: "Client", type: "string" },
  { key: "position", header: "Position", type: "number", numFmt: "0", width: 9 },
  { key: "description", header: "Description", type: "string", width: 40 },
  { key: "sku", header: "SKU", type: "string", width: 16 },
  { key: "sacHsnCode", header: "SAC/HSN", type: "string", width: 10 },
  { key: "unit", header: "Unit", type: "string", width: 10 },
  { key: "quantity", header: "Qty", type: "number", numFmt: "#,##0.000" },
  { key: "rate", header: "Rate", type: "number" },
  { key: "lineSubtotal", header: "Line subtotal", type: "number" },
  { key: "taxRate", header: "Tax rate", type: "number", numFmt: "0.00", width: 10 },
  { key: "taxAmount", header: "Tax amount", type: "number" },
  { key: "lineTotal", header: "Line total", type: "number" },
];

const INCLUDE = {
  client: { select: { displayName: true } },
  items: { orderBy: { position: "asc" } },
} satisfies Prisma.InvoiceInclude;

export const invoiceItemsDataset = defineDataset<RegisterExportFilters, InvoiceItemRow>({
  id: "invoice-items",
  title: "Invoice line items",
  filters: RegisterExportFiltersSchema,
  columns: COLUMNS,
  range: (f) => resolveDateRange(f),
  async *rows(actor, f, opts) {
    const today = todayIn(actor.timezone);
    for await (const { row: inv } of registerInvoices(f, today, opts?.pageSize, INCLUDE)) {
      const cur = inv.currency;
      for (const it of inv.items) {
        yield {
          invoiceNumber: inv.number,
          issueDate: day(inv.issueDate),
          client: inv.client.displayName,
          position: int(it.position),
          description: it.description,
          sku: it.sku,
          sacHsnCode: it.sacHsnCode,
          unit: it.unitType,
          quantity: qty(it.quantity),
          rate: money(it.unitPrice, cur) ?? "0.00",
          lineSubtotal: money(it.lineSubtotal, cur) ?? "0.00",
          taxRate: pct(it.taxRate),
          taxAmount: money(it.taxAmount, cur) ?? "0.00",
          lineTotal: money(it.lineTotal, cur) ?? "0.00",
        };
      }
    }
  },
});
