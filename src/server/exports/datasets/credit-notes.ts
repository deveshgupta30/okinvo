import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import type { Column } from "@/lib/exports/types";
import {
  CreditNoteExportFiltersSchema,
  type CreditNoteExportFilters,
} from "@/lib/schemas/export-filters";
import { resolveDateRange } from "@/server/dal/fiscal-range";
import { paginate } from "../paginate";
import { creditNoteClientName, cursorArgs, dateFilter, day, money } from "./shared";
import { defineDataset } from "./types";

export interface CreditNoteRow extends Record<string, string | null> {
  number: string | null;
  status: string;
  issueDate: string;
  againstInvoice: string | null;
  client: string;
  currency: string;
  subtotal: string;
  tax: string;
  total: string;
  reason: string;
}

const COLUMNS: Column<CreditNoteRow>[] = [
  { key: "number", header: "Number", type: "string", width: 18 },
  { key: "status", header: "Status", type: "string", width: 10 },
  { key: "issueDate", header: "Issue date", type: "date" },
  { key: "againstInvoice", header: "Against invoice", type: "string", width: 18 },
  { key: "client", header: "Client", type: "string" },
  { key: "currency", header: "Currency", type: "string", width: 9 },
  { key: "subtotal", header: "Subtotal", type: "number" },
  { key: "tax", header: "Tax", type: "number" },
  { key: "total", header: "Total", type: "number" },
  { key: "reason", header: "Reason", type: "string", width: 40 },
];

const INCLUDE = {
  invoice: { select: { number: true } },
  client: { select: { displayName: true } },
} satisfies Prisma.CreditNoteInclude;

export const creditNotesDataset = defineDataset<CreditNoteExportFilters, CreditNoteRow>({
  id: "credit-notes",
  title: "Credit notes register",
  filters: CreditNoteExportFiltersSchema,
  columns: COLUMNS,
  range: (f) => resolveDateRange(f),
  async *rows(_actor, f, opts) {
    const issueDate = dateFilter(await resolveDateRange(f));
    const where: Prisma.CreditNoteWhereInput = {
      ...(f.issuerProfileId ? { issuerProfileId: f.issuerProfileId } : {}),
      ...(f.clientId ? { clientId: f.clientId } : {}),
      ...(f.status === "DRAFT" || f.status === "VOID"
        ? { status: f.status }
        : f.status
          ? { status: "ISSUED" }
          : {}),
      ...(issueDate ? { issueDate } : {}),
      ...(f.q
        ? {
            OR: [
              { number: { contains: f.q, mode: "insensitive" } },
              { reason: { contains: f.q, mode: "insensitive" } },
              { invoice: { number: { contains: f.q, mode: "insensitive" } } },
              { client: { displayName: { contains: f.q, mode: "insensitive" } } },
            ],
          }
        : {}),
    };
    const pages = paginate(
      (cursor, take) =>
        prisma.creditNote.findMany({
          where,
          include: INCLUDE,
          orderBy: [{ issueDate: "asc" }, { id: "asc" }],
          take,
          ...cursorArgs(cursor),
        }),
      opts?.pageSize,
    );
    for await (const r of pages) {
      const status = r.status === "ISSUED" ? (r.sentAt ? "SENT" : "ISSUED") : r.status;
      if (f.status && status !== f.status) continue;
      const cur = r.currency;
      yield {
        number: r.number,
        status,
        issueDate: day(r.issueDate),
        againstInvoice: r.invoice.number,
        client: creditNoteClientName(r.snapshot) ?? r.client.displayName,
        currency: cur,
        subtotal: money(r.subtotal, cur) ?? "0.00",
        tax: money(r.taxAmount, cur) ?? "0.00",
        total: money(r.total, cur) ?? "0.00",
        reason: r.reason,
      };
    }
  },
});
