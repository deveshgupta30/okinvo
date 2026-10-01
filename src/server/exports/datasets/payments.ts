import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import type { Column } from "@/lib/exports/types";
import {
  PaymentsExportFiltersSchema,
  type PaymentsExportFilters,
} from "@/lib/schemas/export-filters";
import { paginate } from "../paginate";
import { cursorArgs, dateFilter, day, money, plain } from "./shared";
import { defineDataset } from "./types";

export interface PaymentRow extends Record<string, string | null> {
  date: string;
  kind: string;
  invoiceNumber: string | null;
  client: string;
  currency: string;
  amountApplied: string;
  tdsDeducted: string;
  receivedAmount: string | null;
  receivedCurrency: string | null;
  fxRate: string | null;
  bankFees: string;
  method: string | null;
  reference: string | null;
  notes: string | null;
}

const COLUMNS: Column<PaymentRow>[] = [
  { key: "date", header: "Date", type: "date" },
  { key: "kind", header: "Kind", type: "string", width: 11 },
  { key: "invoiceNumber", header: "Invoice number", type: "string", width: 18 },
  { key: "client", header: "Client", type: "string" },
  { key: "currency", header: "Currency", type: "string", width: 9 },
  { key: "amountApplied", header: "Amount applied", type: "number", width: 16 },
  { key: "tdsDeducted", header: "TDS deducted", type: "number" },
  { key: "receivedAmount", header: "Received amount", type: "number", width: 16 },
  { key: "receivedCurrency", header: "Received currency", type: "string", width: 10 },
  { key: "fxRate", header: "FX rate", type: "number", numFmt: "0.00000000", width: 12 },
  { key: "bankFees", header: "Bank fees", type: "number" },
  { key: "method", header: "Method", type: "string", width: 18 },
  { key: "reference", header: "Reference", type: "string", width: 20 },
  { key: "notes", header: "Notes", type: "string", width: 40 },
];

const INCLUDE = {
  invoice: { select: { number: true, currency: true, client: { select: { displayName: true } } } },
  paymentMethod: { select: { name: true } },
} satisfies Prisma.PaymentInclude;

export const paymentsDataset = defineDataset<PaymentsExportFilters, PaymentRow>({
  id: "payments",
  title: "Payments ledger",
  filters: PaymentsExportFiltersSchema,
  columns: COLUMNS,
  range: (f) => Promise.resolve({ from: f.from, to: f.to }),
  async *rows(_actor, f, opts) {
    const paymentDate = dateFilter({ from: f.from, to: f.to });
    const where: Prisma.PaymentWhereInput = {
      ...(paymentDate ? { paymentDate } : {}),
      ...(f.paymentMethodProfileId ? { paymentMethodProfileId: f.paymentMethodProfileId } : {}),
      ...(f.issuerProfileId || f.clientId
        ? {
            invoice: {
              ...(f.issuerProfileId ? { issuerProfileId: f.issuerProfileId } : {}),
              ...(f.clientId ? { clientId: f.clientId } : {}),
            },
          }
        : {}),
    };
    const pages = paginate(
      (cursor, take) =>
        prisma.payment.findMany({
          where,
          include: INCLUDE,
          orderBy: [{ paymentDate: "asc" }, { id: "asc" }],
          take,
          ...cursorArgs(cursor),
        }),
      opts?.pageSize,
    );
    for await (const p of pages) {
      const cur = p.invoice.currency;
      yield {
        date: day(p.paymentDate),
        kind: p.kind,
        invoiceNumber: p.invoice.number,
        client: p.invoice.client.displayName,
        currency: cur,
        amountApplied: money(p.amountApplied, cur) ?? "0.00",
        tdsDeducted: money(p.tdsDeducted, cur) ?? "0.00",
        receivedAmount:
          p.receivedAmount !== null && p.receivedCurrency
            ? money(p.receivedAmount, p.receivedCurrency)
            : null,
        receivedCurrency: p.receivedCurrency,
        fxRate: plain(p.exchangeRate),
        bankFees: money(p.bankFees, cur) ?? "0.00",
        method: p.paymentMethod?.name ?? null,
        reference: p.reference,
        notes: p.notes,
      };
    }
  },
});
