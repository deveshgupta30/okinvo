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

export interface ServiceRow extends Record<string, string | null> {
  id: string;
  name: string;
  description: string | null;
  unitType: string;
  defaultRate: string;
  currency: string;
  sacHsnCode: string | null;
  defaultTaxRate: string;
  isActive: string;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

const COLUMNS: Column<ServiceRow>[] = [
  { key: "id", header: "ID", type: "string", width: 38 },
  { key: "name", header: "Name", type: "string", width: 30 },
  { key: "description", header: "Description", type: "string", width: 40 },
  { key: "unitType", header: "Unit type", type: "string", width: 10 },
  { key: "defaultRate", header: "Default rate", type: "number" },
  { key: "currency", header: "Currency", type: "string", width: 9 },
  { key: "sacHsnCode", header: "SAC/HSN", type: "string", width: 10 },
  { key: "defaultTaxRate", header: "Default tax rate", type: "number", numFmt: "0.00", width: 10 },
  { key: "isActive", header: "Active", type: "string", width: 8 },
  { key: "archivedAt", header: "Archived at", type: "datetime" },
  { key: "createdAt", header: "Created at", type: "datetime" },
  { key: "updatedAt", header: "Updated at", type: "datetime" },
];

export const servicesDataset = defineDataset<ArchiveExportFilters, ServiceRow>({
  id: "services",
  title: "Services",
  filters: ArchiveExportFiltersSchema,
  columns: COLUMNS,
  range: () => Promise.resolve(null),
  async *rows(_actor, f, opts) {
    const pages = paginate(
      (cursor, take) =>
        prisma.serviceItem.findMany({
          where: f.archived ? { archivedAt: {} } : {},
          orderBy: [{ name: "asc" }, { id: "asc" }],
          take,
          ...cursorArgs(cursor),
        }),
      opts?.pageSize,
    );
    for await (const s of pages) {
      yield {
        id: s.id,
        name: s.name,
        description: s.description,
        unitType: s.unitType,
        defaultRate: money(s.defaultRate, s.currency) ?? "0.00",
        currency: s.currency,
        sacHsnCode: s.sacHsnCode,
        defaultTaxRate: pct(s.defaultTaxRate),
        isActive: bool(s.isActive),
        archivedAt: iso(s.archivedAt),
        createdAt: iso(s.createdAt) ?? "",
        updatedAt: iso(s.updatedAt) ?? "",
      };
    }
  },
});
