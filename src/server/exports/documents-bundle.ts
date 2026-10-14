import "server-only";
import { prisma } from "@/lib/db";
import {
  documentFileName,
  documentsIndexCsv,
  type DocumentIndexRow,
  type ZipEntry,
} from "@/lib/exports/zip";
import type { PeriodExportFilters } from "@/lib/schemas/export-filters";
import { storage } from "@/lib/storage";
import type { Actor } from "@/server/actor";
import { ensureDocument } from "@/server/dal/documents";
import { resolveDateRange, type DateRange } from "@/server/dal/fiscal-range";
import { cursorArgs, dateFilter, day, money } from "./datasets/shared";
import { paginate } from "./paginate";

/**
 * "Export documents" (SPEC §4.11): every issued or voided invoice and credit-note PDF of a fiscal
 * year or date range, named by number, plus an `index.csv` - the accountant hand-off. A document
 * that was never rendered (or whose render failed at issue) is rendered here through the same
 * idempotent `ensureDocument` (plan R10), one at a time as the archive streams, so the first bytes
 * leave before the last PDF is produced. The index is written last because it is built on the way.
 */
export function documentsBundleRange(f: PeriodExportFilters): Promise<DateRange> {
  return resolveDateRange(f);
}

export async function* documentsBundleEntries(
  _actor: Actor,
  f: PeriodExportFilters,
): AsyncGenerator<ZipEntry> {
  const issueDate = dateFilter(await resolveDateRange(f));
  const where = {
    status: { in: ["ISSUED", "VOID"] as ("ISSUED" | "VOID")[] },
    ...(f.issuerProfileId ? { issuerProfileId: f.issuerProfileId } : {}),
    ...(issueDate ? { issueDate } : {}),
  };
  const index: DocumentIndexRow[] = [];
  // Numbers are unique per issuer only: a bundle across issuers gets a folder per issuer label.
  const perIssuer = !f.issuerProfileId;
  const folderFor = (label: string) => (perIssuer ? label : undefined);

  const invoices = paginate((cursor, take) =>
    prisma.invoice.findMany({
      where,
      select: {
        id: true,
        number: true,
        status: true,
        issueDate: true,
        currency: true,
        total: true,
        client: { select: { displayName: true } },
        issuerProfile: { select: { label: true } },
      },
      orderBy: [{ issueDate: "asc" }, { id: "asc" }],
      take,
      ...cursorArgs(cursor),
    }),
  );
  for await (const inv of invoices) {
    if (!inv.number) continue;
    const doc = await ensureDocument("INVOICE", inv.id);
    const file = documentFileName(
      "INVOICE",
      inv.number,
      doc.version,
      folderFor(inv.issuerProfile.label),
    );
    index.push({
      kind: "INVOICE",
      number: inv.number,
      status: inv.status,
      issueDate: day(inv.issueDate),
      issuer: inv.issuerProfile.label,
      client: inv.client.displayName,
      currency: inv.currency,
      total: money(inv.total, inv.currency) ?? "0.00",
      file,
      version: String(doc.version),
      sha256: doc.sha256,
    });
    yield { name: file, body: async () => (await storage.get(doc.storageKey)).stream };
    if (f.docx) {
      const docx = await ensureDocument("INVOICE", inv.id, { format: "DOCX" });
      yield {
        name: documentFileName(
          "INVOICE",
          inv.number,
          docx.version,
          folderFor(inv.issuerProfile.label),
          "docx",
        ),
        body: async () => (await storage.get(docx.storageKey)).stream,
      };
    }
    if (f.facturx) {
      const fx = await ensureDocument("INVOICE", inv.id, { format: "PDF_A3" });
      yield {
        name: documentFileName(
          "INVOICE",
          inv.number,
          fx.version,
          folderFor(inv.issuerProfile.label),
          "pdf",
          "facturx",
        ),
        body: async () => (await storage.get(fx.storageKey)).stream,
      };
    }
  }

  const creditNotes = paginate((cursor, take) =>
    prisma.creditNote.findMany({
      where,
      select: {
        id: true,
        number: true,
        status: true,
        issueDate: true,
        currency: true,
        total: true,
        client: { select: { displayName: true } },
        issuerProfile: { select: { label: true } },
      },
      orderBy: [{ issueDate: "asc" }, { id: "asc" }],
      take,
      ...cursorArgs(cursor),
    }),
  );
  for await (const cn of creditNotes) {
    if (!cn.number) continue;
    const doc = await ensureDocument("CREDIT_NOTE", cn.id);
    const file = documentFileName(
      "CREDIT_NOTE",
      cn.number,
      doc.version,
      folderFor(cn.issuerProfile.label),
    );
    index.push({
      kind: "CREDIT_NOTE",
      number: cn.number,
      status: cn.status,
      issueDate: day(cn.issueDate),
      issuer: cn.issuerProfile.label,
      client: cn.client.displayName,
      currency: cn.currency,
      total: money(cn.total, cn.currency) ?? "0.00",
      file,
      version: String(doc.version),
      sha256: doc.sha256,
    });
    yield { name: file, body: async () => (await storage.get(doc.storageKey)).stream };
    if (f.docx) {
      const docx = await ensureDocument("CREDIT_NOTE", cn.id, { format: "DOCX" });
      yield {
        name: documentFileName(
          "CREDIT_NOTE",
          cn.number,
          docx.version,
          folderFor(cn.issuerProfile.label),
          "docx",
        ),
        body: async () => (await storage.get(docx.storageKey)).stream,
      };
    }
    if (f.facturx) {
      const fx = await ensureDocument("CREDIT_NOTE", cn.id, { format: "PDF_A3" });
      yield {
        name: documentFileName(
          "CREDIT_NOTE",
          cn.number,
          fx.version,
          folderFor(cn.issuerProfile.label),
          "pdf",
          "facturx",
        ),
        body: async () => (await storage.get(fx.storageKey)).stream,
      };
    }
  }

  yield { name: "index.csv", body: () => documentsIndexCsv(index) };
}
