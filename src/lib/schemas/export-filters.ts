import { z } from "zod";
import { DateStringSchema } from "@/lib/dates";
import { fBool, fOptional } from "@/lib/forms";
import { CurrencySchema } from "./currency";

/**
 * Filters accepted by `GET /api/exports/[dataset]` (SPEC §4.11). They mirror the index pages'
 * query strings so an Export control can forward the page's search params unchanged; unknown keys
 * (`format`, `page`) are dropped by Zod.
 */
const fy = fOptional(z.string().regex(/^\d{4}(-\d{2})?$/, "not a fiscal-year label"));
const date = fOptional(DateStringSchema);
const id = fOptional(z.string().trim().max(64));

export const INVOICE_EXPORT_STATUSES = [
  "DRAFT",
  "ISSUED",
  "SENT",
  "PARTIALLY_PAID",
  "PAID",
  "OVERDUE",
  "VOID",
] as const;

/** Invoices register and line items: FY or date range, issuer, client, status, currency. */
export const RegisterExportFiltersSchema = z.object({
  fy,
  from: date,
  to: date,
  issuerProfileId: id,
  clientId: id,
  status: fOptional(z.enum(INVOICE_EXPORT_STATUSES)),
  currency: fOptional(CurrencySchema),
  q: fOptional(z.string().trim().max(80)),
});
export type RegisterExportFilters = z.infer<typeof RegisterExportFiltersSchema>;

export const CreditNoteExportFiltersSchema = z.object({
  fy,
  from: date,
  to: date,
  issuerProfileId: id,
  clientId: id,
  status: fOptional(z.enum(["DRAFT", "ISSUED", "SENT", "VOID"])),
  q: fOptional(z.string().trim().max(80)),
});
export type CreditNoteExportFilters = z.infer<typeof CreditNoteExportFiltersSchema>;

/** Payments ledger: date range (payment date), issuer, client, method. */
export const PaymentsExportFiltersSchema = z.object({
  from: date,
  to: date,
  issuerProfileId: id,
  clientId: id,
  paymentMethodProfileId: id,
});
export type PaymentsExportFilters = z.infer<typeof PaymentsExportFiltersSchema>;

/** Clients and services: active only by default; `archived=1` includes archived rows. */
export const ArchiveExportFiltersSchema = z.object({ archived: fBool.default(false) });
export type ArchiveExportFilters = z.infer<typeof ArchiveExportFiltersSchema>;

/** GST and TDS summaries: FY or date range, issuer. */
export const PeriodExportFiltersSchema = z.object({
  /** Documents bundle only: also include a DOCX copy of every document. */
  docx: fBool.optional(),
  facturx: fBool.optional(),
  fy,
  from: date,
  to: date,
  issuerProfileId: id,
});
export type PeriodExportFilters = z.infer<typeof PeriodExportFiltersSchema>;

export const ExportFormatSchema = z.enum(["csv", "xlsx"]).default("csv");
