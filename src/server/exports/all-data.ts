import "server-only";
import { Readable } from "node:stream";
import { prisma } from "@/lib/db";
import { csvChunks } from "@/lib/exports/csv";
import type { ZipEntry } from "@/lib/exports/zip";
import { APP_VERSION } from "@/lib/version";
import type { Actor } from "@/server/actor";
import { DATASETS } from "./datasets";
import { cursorArgs } from "./datasets/shared";
import { paginate } from "./paginate";

/**
 * "Export all data" (SPEC §4.11): every dataset as CSV, plus `data.json` — a full relational
 * snapshot for migration or re-import — and a README describing it. Encrypted columns and the
 * SMTP setting never leave the database; the README lists exactly what was left out.
 */
export const SNAPSHOT_SCHEMA_VERSION = 1;
export const EXCLUDED_FIELDS = ["detailsEnc", "usTaxIdEnc", "passwordEnc"] as const;
export const EXCLUDED_SETTINGS = ["smtp"] as const;
const EXCLUDED = new Set<string>(EXCLUDED_FIELDS);

interface Table {
  name: string;
  rows(): AsyncIterable<unknown>;
}

/** Offset pages for the one table without a single-column id. */
async function* offsetPages<T>(
  page: (skip: number, take: number) => Promise<T[]>,
  take = 500,
): AsyncGenerator<T> {
  for (let skip = 0; ; skip += take) {
    const rows = await page(skip, take);
    for (const r of rows) yield r;
    if (rows.length < take) return;
  }
}

const byId = { orderBy: { id: "asc" as const } };
/** Names `archivedAt` so the archive extension includes archived rows (R3). */
const everyRow = { where: { archivedAt: {} } };

const TABLES: Table[] = [
  {
    name: "users",
    rows: () =>
      paginate((cursor, take) =>
        prisma.user.findMany({
          select: {
            id: true,
            name: true,
            email: true,
            emailVerified: true,
            image: true,
            role: true,
            timezone: true,
            theme: true,
            createdAt: true,
            updatedAt: true,
          },
          ...byId,
          take,
          ...cursorArgs(cursor),
        }),
      ),
  },
  {
    name: "issuerProfiles",
    rows: () =>
      paginate((cursor, take) =>
        prisma.issuerProfile.findMany({
          ...everyRow,
          omit: { usTaxIdEnc: true },
          ...byId,
          take,
          ...cursorArgs(cursor),
        }),
      ),
  },
  {
    name: "documentSequences",
    rows: () =>
      paginate((cursor, take) =>
        prisma.documentSequence.findMany({ ...byId, take, ...cursorArgs(cursor) }),
      ),
  },
  {
    name: "clients",
    rows: () =>
      paginate((cursor, take) =>
        prisma.client.findMany({ ...everyRow, ...byId, take, ...cursorArgs(cursor) }),
      ),
  },
  {
    name: "serviceItems",
    rows: () =>
      paginate((cursor, take) =>
        prisma.serviceItem.findMany({ ...everyRow, ...byId, take, ...cursorArgs(cursor) }),
      ),
  },
  {
    name: "paymentMethodProfiles",
    rows: () =>
      paginate((cursor, take) =>
        prisma.paymentMethodProfile.findMany({
          ...everyRow,
          omit: { detailsEnc: true },
          ...byId,
          take,
          ...cursorArgs(cursor),
        }),
      ),
  },
  {
    name: "assets",
    rows: () =>
      paginate((cursor, take) => prisma.asset.findMany({ ...byId, take, ...cursorArgs(cursor) })),
  },
  {
    name: "invoices",
    rows: () =>
      paginate((cursor, take) => prisma.invoice.findMany({ ...byId, take, ...cursorArgs(cursor) })),
  },
  {
    name: "invoiceItems",
    rows: () =>
      paginate((cursor, take) =>
        prisma.invoiceItem.findMany({ ...byId, take, ...cursorArgs(cursor) }),
      ),
  },
  {
    name: "invoiceTaxLines",
    rows: () =>
      paginate((cursor, take) =>
        prisma.invoiceTaxLine.findMany({ ...byId, take, ...cursorArgs(cursor) }),
      ),
  },
  {
    name: "invoicePaymentMethods",
    rows: () =>
      offsetPages((skip, take) =>
        prisma.invoicePaymentMethod.findMany({
          orderBy: [{ invoiceId: "asc" }, { paymentMethodProfileId: "asc" }],
          skip,
          take,
        }),
      ),
  },
  {
    name: "payments",
    rows: () =>
      paginate((cursor, take) => prisma.payment.findMany({ ...byId, take, ...cursorArgs(cursor) })),
  },
  {
    name: "creditNotes",
    rows: () =>
      paginate((cursor, take) =>
        prisma.creditNote.findMany({ ...byId, take, ...cursorArgs(cursor) }),
      ),
  },
  {
    name: "creditNoteTaxLines",
    rows: () =>
      paginate((cursor, take) =>
        prisma.creditNoteTaxLine.findMany({ ...byId, take, ...cursorArgs(cursor) }),
      ),
  },
  {
    name: "documents",
    rows: () =>
      paginate((cursor, take) =>
        prisma.document.findMany({ ...byId, take, ...cursorArgs(cursor) }),
      ),
  },
  {
    name: "emailMessages",
    rows: () =>
      paginate((cursor, take) =>
        prisma.emailMessage.findMany({ ...byId, take, ...cursorArgs(cursor) }),
      ),
  },
  {
    name: "appSettings",
    rows: async function* () {
      const rows = await prisma.appSetting.findMany({
        where: { key: { notIn: [...EXCLUDED_SETTINGS] } },
        orderBy: { key: "asc" },
      });
      for (const r of rows) yield r;
    },
  },
  {
    name: "auditEvents",
    rows: () =>
      paginate((cursor, take) =>
        prisma.auditEvent.findMany({ ...byId, take, ...cursorArgs(cursor) }),
      ),
  },
];

/** Belt and braces: drop excluded keys even if a query above ever forgets `omit`. */
function strip(row: unknown): unknown {
  if (!row || typeof row !== "object" || Array.isArray(row)) return row;
  return Object.fromEntries(Object.entries(row).filter(([k]) => !EXCLUDED.has(k)));
}

/** `data.json` as text chunks: one table at a time, one row per chunk, never the whole file. */
export async function* snapshotJsonChunks(exportedAt: string): AsyncGenerator<string> {
  const head = {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    appVersion: APP_VERSION,
    exportedAt,
    excludedFields: [...EXCLUDED_FIELDS],
    excludedSettings: [...EXCLUDED_SETTINGS],
  };
  yield `${JSON.stringify(head).slice(0, -1)},"tables":{`;
  let firstTable = true;
  for (const t of TABLES) {
    yield `${firstTable ? "" : ","}${JSON.stringify(t.name)}:[`;
    firstTable = false;
    let first = true;
    for await (const row of t.rows()) {
      yield `${first ? "" : ","}${JSON.stringify(strip(row))}`;
      first = false;
    }
    yield "]";
  }
  yield "}}";
}

export function readme(exportedAt: string): string {
  return [
    "okinvo — export all data",
    "",
    `Exported at: ${exportedAt}`,
    `App version: ${APP_VERSION}`,
    `Snapshot schemaVersion: ${SNAPSHOT_SCHEMA_VERSION}`,
    "",
    "Contents",
    "  csv/<dataset>.csv  Every dataset from Settings → Data as UTF-8 (BOM) CSV, including",
    "                     archived clients and services. Text cells that could be read as a",
    "                     spreadsheet formula are prefixed with an apostrophe.",
    "  data.json          A relational snapshot of every table, one array per table under",
    '                     "tables", with the database\'s own ids so rows can be re-linked.',
    "                     Amounts are decimal strings; dates and instants are ISO 8601.",
    "",
    "What is NOT in data.json",
    `  Columns: ${EXCLUDED_FIELDS.join(", ")} — encrypted at rest (payment-method details, US tax`,
    "           ids, SMTP password). Re-enter them after a re-import.",
    `  Settings: ${EXCLUDED_SETTINGS.join(", ")} — the SMTP configuration.`,
    "  Tables: session, account, verification (sign-in state), rateLimitBucket (transient).",
    "  Blobs: PDFs, logos, signatures, stamps and receipts live in the storage volume; the",
    "         documents and assets tables carry their storage keys and SHA-256 hashes.",
    "         Use “Export documents” for the PDFs, and the backup service for the whole volume.",
    "",
  ].join("\n");
}

/** The entries of the all-data ZIP, in the order they are written. */
export async function* allDataEntries(actor: Actor): AsyncGenerator<ZipEntry> {
  const exportedAt = new Date().toISOString();
  const date = new Date(exportedAt);
  yield { name: "README.txt", body: readme(exportedAt), date };
  for (const ds of DATASETS) {
    yield {
      name: `csv/${ds.id}.csv`,
      // `archived=1` includes archived rows for clients/services; other schemas drop the key.
      body: () =>
        Readable.from(
          utf8(csvChunks(ds.columns, ds.rows(actor, ds.filters.parse({ archived: "1" })))),
          { objectMode: false },
        ),
      date,
    };
  }
  yield {
    name: "data.json",
    body: () => Readable.from(utf8(snapshotJsonChunks(exportedAt)), { objectMode: false }),
    date,
  };
}

async function* utf8(chunks: AsyncIterable<string>): AsyncGenerator<Buffer> {
  for await (const c of chunks) yield Buffer.from(c, "utf8");
}
