import { z } from "zod";
import { DateStringSchema } from "@/lib/dates";
import { fBool, fOptional } from "@/lib/forms";
import { CurrencySchema } from "@/lib/schemas/currency";
import { MAX_LIMIT } from "./pagination";

/** Query parameters of the list endpoints (spec §7.2). */
const page = {
  cursor: fOptional(z.string().max(64)),
  limit: fOptional(z.coerce.number().int().min(1).max(MAX_LIMIT)),
};

export const InvoiceListQuerySchema = z.object({
  ...page,
  fy: fOptional(z.string().regex(/^\d{4}(-\d{2})?$/)),
  from: fOptional(DateStringSchema),
  to: fOptional(DateStringSchema),
  issuerProfileId: fOptional(z.string().max(64)),
  clientId: fOptional(z.string().max(64)),
  status: fOptional(
    z.enum(["DRAFT", "ISSUED", "SENT", "PARTIALLY_PAID", "PAID", "OVERDUE", "VOID"]),
  ),
  currency: fOptional(CurrencySchema),
  q: fOptional(z.string().trim().max(80)),
});
export type InvoiceListQuery = z.infer<typeof InvoiceListQuerySchema>;

export const CreditNoteListQuerySchema = z.object({
  ...page,
  fy: fOptional(z.string().regex(/^\d{4}(-\d{2})?$/)),
  from: fOptional(DateStringSchema),
  to: fOptional(DateStringSchema),
  issuerProfileId: fOptional(z.string().max(64)),
  clientId: fOptional(z.string().max(64)),
  invoiceId: fOptional(z.string().max(64)),
  status: fOptional(z.enum(["DRAFT", "ISSUED", "VOID"])),
});
export type CreditNoteListQuery = z.infer<typeof CreditNoteListQuerySchema>;

export const CatalogueListQuerySchema = z.object({
  ...page,
  q: fOptional(z.string().trim().max(80)),
  includeArchived: fBool.optional(),
  /** Services and products: only those offered to this issuer profile. */
  issuerProfileId: fOptional(z.string().max(64)),
});
export type CatalogueListQuery = z.infer<typeof CatalogueListQuerySchema>;

export function queryObject(request: Request): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of new URL(request.url).searchParams) if (v !== "") out[k] = v;
  return out;
}
