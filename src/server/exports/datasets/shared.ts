import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { fromDateString, toDateString } from "@/lib/dates";
import { D, roundMoney, toMoneyString, type Decimal } from "@/lib/money";
import {
  AddressSchema,
  ClientSnapshotSchema,
  CreditNoteSnapshotSchema,
  IssuerSnapshotSchema,
  type Address,
} from "@/lib/schemas";
import type { RegisterExportFilters } from "@/lib/schemas/export-filters";
import type { DateRange } from "@/server/dal/fiscal-range";

/** Cell formatters: every amount becomes a canonical decimal string, never a `number`. */
export const money = (v: Decimal.Value | null | undefined, currency: string): string | null =>
  v === null || v === undefined
    ? null
    : toMoneyString(roundMoney(v.toString(), currency), currency);
export const pct = (v: Decimal.Value): string => D(v.toString()).toFixed(2);
export const qty = (v: Decimal.Value): string => D(v.toString()).toFixed(3);
export const plain = (v: Decimal.Value | null | undefined): string | null =>
  v === null || v === undefined ? null : D(v.toString()).toString();
export const int = (n: number): string => String(n);
export const iso = (d: Date | null | undefined): string | null => d?.toISOString() ?? null;
export const day = (d: Date): string => toDateString(d);
export const bool = (b: boolean): string => (b ? "true" : "false");

/** Prisma cursor pagination arguments for a query ordered by a key list ending in `id`. */
export function cursorArgs(
  cursor: string | null,
): { cursor: { id: string }; skip: number } | object {
  return cursor ? { cursor: { id: cursor }, skip: 1 } : {};
}

export function dateFilter(range: DateRange): Prisma.DateTimeFilter | undefined {
  if (!range.from && !range.to) return undefined;
  return {
    ...(range.from ? { gte: fromDateString(range.from) } : {}),
    ...(range.to ? { lte: fromDateString(range.to) } : {}),
  };
}

const DERIVED = new Set(["ISSUED", "SENT", "PARTIALLY_PAID", "PAID", "OVERDUE"]);

/**
 * The register's `where` (same semantics as `listInvoices`): DRAFT and VOID map to the stored
 * status; every other status filter selects ISSUED rows and the caller narrows by the derived
 * display status, which depends on "today" in the viewer's zone.
 */
export function invoiceWhere(
  f: Partial<RegisterExportFilters>,
  range: DateRange,
): Prisma.InvoiceWhereInput {
  const issueDate = dateFilter(range);
  return {
    ...(f.issuerProfileId ? { issuerProfileId: f.issuerProfileId } : {}),
    ...(f.clientId ? { clientId: f.clientId } : {}),
    ...(f.currency ? { currency: f.currency } : {}),
    ...(f.status === "DRAFT" || f.status === "VOID"
      ? { status: f.status }
      : f.status && DERIVED.has(f.status)
        ? { status: "ISSUED" }
        : {}),
    ...(issueDate ? { issueDate } : {}),
    ...(f.q
      ? {
          OR: [
            { number: { contains: f.q, mode: "insensitive" } },
            { poReference: { contains: f.q, mode: "insensitive" } },
            { client: { displayName: { contains: f.q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
}

/** The client's tax ID as frozen at issue, else the current client row. */
export function clientTaxId(
  snapshot: unknown,
  client: { taxId: string | null; taxIdType: string | null },
): { taxId: string | null; taxIdType: string | null } {
  const parsed = snapshot ? ClientSnapshotSchema.safeParse(snapshot) : null;
  if (parsed?.success) {
    return { taxId: parsed.data.taxId ?? null, taxIdType: parsed.data.taxIdType ?? null };
  }
  return { taxId: client.taxId, taxIdType: client.taxIdType };
}

/** The issuer and client names frozen at issue (null for drafts, which have no snapshot yet). */
export function snapshotNames(row: { issuerSnapshot: unknown; clientSnapshot: unknown }): {
  issuer: string | null;
  client: string | null;
} {
  const i = row.issuerSnapshot ? IssuerSnapshotSchema.safeParse(row.issuerSnapshot) : null;
  const c = row.clientSnapshot ? ClientSnapshotSchema.safeParse(row.clientSnapshot) : null;
  return {
    issuer: i?.success ? i.data.legalName : null,
    client: c?.success ? c.data.displayName : null,
  };
}

/** The client name a credit note was issued to, from its own snapshot. */
export function creditNoteClientName(snapshot: unknown): string | null {
  if (!snapshot) return null;
  const parsed = CreditNoteSnapshotSchema.safeParse(snapshot);
  return parsed.success ? parsed.data.client.displayName : null;
}

/** The 10-character PAN embedded in a GSTIN (positions 3-12); null for any other tax ID. */
export function panFromGstin(taxId: string | null, taxIdType: string | null): string | null {
  if (taxIdType !== "GSTIN" || !taxId || taxId.length !== 15) return null;
  return taxId.slice(2, 12).toUpperCase();
}

export function parseAddress(v: unknown): Address | null {
  if (!v) return null;
  const parsed = AddressSchema.safeParse(v);
  return parsed.success ? parsed.data : null;
}
