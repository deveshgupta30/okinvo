import "server-only";
import { prisma } from "@/lib/db";
import type { Column } from "@/lib/exports/types";
import {
  ArchiveExportFiltersSchema,
  type ArchiveExportFilters,
} from "@/lib/schemas/export-filters";
import { paginate } from "../paginate";
import { bool, cursorArgs, iso, money, pct } from "./shared";
import { defineDataset } from "./types";

export interface ProductRow extends Record<string, string | null> {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  unitType: string;
  unitPrice: string;
  currency: string;
  hsnCode: string | null;
  defaultTaxRate: string;
  isActive: string;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

const COLUMNS: Column<ProductRow>[] = [
  { key: "id", header: "ID", type: "string", width: 38 },
  { key: "sku", header: "SKU", type: "string", width: 18 },
  { key: "name", header: "Name", type: "string", width: 30 },
  { key: "description", header: "Description", type: "string", width: 40 },
  { key: "unitType", header: "Unit type", type: "string", width: 10 },
  { key: "unitPrice", header: "Unit price", type: "number" },
  { key: "currency", header: "Currency", type: "string", width: 9 },
  { key: "hsnCode", header: "HSN", type: "string", width: 10 },
  { key: "defaultTaxRate", header: "Default tax rate", type: "number", numFmt: "0.00", width: 10 },
  { key: "isActive", header: "Active", type: "string", width: 8 },
  { key: "archivedAt", header: "Archived at", type: "datetime" },
  { key: "createdAt", header: "Created at", type: "datetime" },
  { key: "updatedAt", header: "Updated at", type: "datetime" },
];

export const productsDataset = defineDataset<ArchiveExportFilters, ProductRow>({
  id: "products",
  title: "Products",
  filters: ArchiveExportFiltersSchema,
  columns: COLUMNS,
  range: () => Promise.resolve(null),
  async *rows(_actor, f, opts) {
    const pages = paginate(
      (cursor, take) =>
        prisma.product.findMany({
          where: f.archived ? { archivedAt: {} } : {},
          orderBy: [{ name: "asc" }, { id: "asc" }],
          take,
          ...cursorArgs(cursor),
        }),
      opts?.pageSize,
    );
    for await (const p of pages) {
      yield {
        id: p.id,
        sku: p.sku,
        name: p.name,
        description: p.description,
        unitType: p.unitType,
        unitPrice: money(p.unitPrice, p.currency) ?? "0.00",
        currency: p.currency,
        hsnCode: p.hsnCode,
        defaultTaxRate: pct(p.defaultTaxRate),
        isActive: bool(p.isActive),
        archivedAt: iso(p.archivedAt),
        createdAt: iso(p.createdAt) ?? "",
        updatedAt: iso(p.updatedAt) ?? "",
      };
    }
  },
});
