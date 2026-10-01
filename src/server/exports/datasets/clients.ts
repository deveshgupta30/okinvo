import "server-only";
import { prisma } from "@/lib/db";
import type { Column } from "@/lib/exports/types";
import {
  ArchiveExportFiltersSchema,
  type ArchiveExportFilters,
} from "@/lib/schemas/export-filters";
import { paginate } from "../paginate";
import { cursorArgs, int, iso, parseAddress, plain } from "./shared";
import { defineDataset } from "./types";

export interface ClientRow extends Record<string, string | null> {
  id: string;
  displayName: string;
  contactPerson: string | null;
  email: string | null;
  phone: string | null;
  billingLine1: string | null;
  billingLine2: string | null;
  billingCity: string | null;
  billingState: string | null;
  billingPostalCode: string | null;
  billingCountry: string | null;
  shippingLine1: string | null;
  shippingLine2: string | null;
  shippingCity: string | null;
  shippingState: string | null;
  shippingPostalCode: string | null;
  shippingCountry: string | null;
  countryCode: string;
  stateCode: string | null;
  gstStateCode: string | null;
  taxIdType: string | null;
  taxId: string | null;
  currency: string;
  paymentTermsDays: string;
  defaultTdsRate: string | null;
  notes: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

const COLUMNS: Column<ClientRow>[] = [
  { key: "id", header: "ID", type: "string", width: 38 },
  { key: "displayName", header: "Display name", type: "string" },
  { key: "contactPerson", header: "Contact person", type: "string" },
  { key: "email", header: "Email", type: "string" },
  { key: "phone", header: "Phone", type: "string", width: 16 },
  { key: "billingLine1", header: "Billing line 1", type: "string" },
  { key: "billingLine2", header: "Billing line 2", type: "string" },
  { key: "billingCity", header: "Billing city", type: "string", width: 16 },
  { key: "billingState", header: "Billing state", type: "string", width: 16 },
  { key: "billingPostalCode", header: "Billing postal code", type: "string", width: 12 },
  { key: "billingCountry", header: "Billing country", type: "string", width: 8 },
  { key: "shippingLine1", header: "Shipping line 1", type: "string" },
  { key: "shippingLine2", header: "Shipping line 2", type: "string" },
  { key: "shippingCity", header: "Shipping city", type: "string", width: 16 },
  { key: "shippingState", header: "Shipping state", type: "string", width: 16 },
  { key: "shippingPostalCode", header: "Shipping postal code", type: "string", width: 12 },
  { key: "shippingCountry", header: "Shipping country", type: "string", width: 8 },
  { key: "countryCode", header: "Country code", type: "string", width: 8 },
  { key: "stateCode", header: "State code", type: "string", width: 8 },
  { key: "gstStateCode", header: "GST state code", type: "string", width: 8 },
  { key: "taxIdType", header: "Tax ID type", type: "string", width: 10 },
  { key: "taxId", header: "Tax ID", type: "string", width: 18 },
  { key: "currency", header: "Currency", type: "string", width: 9 },
  {
    key: "paymentTermsDays",
    header: "Payment terms (days)",
    type: "number",
    numFmt: "0",
    width: 10,
  },
  { key: "defaultTdsRate", header: "Default TDS rate", type: "number", numFmt: "0.00", width: 10 },
  { key: "notes", header: "Notes", type: "string", width: 40 },
  { key: "archivedAt", header: "Archived at", type: "datetime" },
  { key: "createdAt", header: "Created at", type: "datetime" },
  { key: "updatedAt", header: "Updated at", type: "datetime" },
];

export const clientsDataset = defineDataset<ArchiveExportFilters, ClientRow>({
  id: "clients",
  title: "Clients",
  filters: ArchiveExportFiltersSchema,
  columns: COLUMNS,
  range: () => Promise.resolve(null),
  async *rows(_actor, f, opts) {
    const pages = paginate(
      (cursor, take) =>
        prisma.client.findMany({
          // `archivedAt: {}` names the column so the archive extension includes archived rows.
          where: f.archived ? { archivedAt: {} } : {},
          orderBy: [{ displayName: "asc" }, { id: "asc" }],
          take,
          ...cursorArgs(cursor),
        }),
      opts?.pageSize,
    );
    for await (const c of pages) {
      const b = parseAddress(c.billingAddress);
      const s = parseAddress(c.shippingAddress);
      yield {
        id: c.id,
        displayName: c.displayName,
        contactPerson: c.contactPerson,
        email: c.email,
        phone: c.phone,
        billingLine1: b?.line1 ?? null,
        billingLine2: b?.line2 ?? null,
        billingCity: b?.city ?? null,
        billingState: b?.state ?? null,
        billingPostalCode: b?.postalCode ?? null,
        billingCountry: b?.countryCode ?? null,
        shippingLine1: s?.line1 ?? null,
        shippingLine2: s?.line2 ?? null,
        shippingCity: s?.city ?? null,
        shippingState: s?.state ?? null,
        shippingPostalCode: s?.postalCode ?? null,
        shippingCountry: s?.countryCode ?? null,
        countryCode: c.countryCode,
        stateCode: c.stateCode,
        gstStateCode: c.gstStateCode,
        taxIdType: c.taxIdType,
        taxId: c.taxId,
        currency: c.currency,
        paymentTermsDays: int(c.paymentTermsDays),
        defaultTdsRate: plain(c.defaultTdsRate),
        notes: c.notes,
        archivedAt: iso(c.archivedAt),
        createdAt: iso(c.createdAt) ?? "",
        updatedAt: iso(c.updatedAt) ?? "",
      };
    }
  },
});
