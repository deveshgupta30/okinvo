import { once } from "node:events";
import { PassThrough, type Readable } from "node:stream";
import { ZipArchive } from "archiver";
import { safeFileStem } from "@/lib/numbering/format";
import { csvString } from "./csv";
import type { Column } from "./types";

/**
 * ZIP bundles (SPEC §4.11 "Settings → Data", v2 §13.2): archiver's `ZipArchive` into a PassThrough.
 * Entries
 * are appended one at a time and each body is produced only when its turn comes, so a bundle of
 * hundreds of PDFs opens one storage stream at a time rather than all of them up front.
 */
export type ZipBody = Readable | Buffer | string;

export interface ZipEntry {
  /** Path inside the archive, forward slashes, no leading slash. */
  name: string;
  body: ZipBody | (() => ZipBody | Promise<ZipBody>);
  date?: Date | undefined;
}

export function zipStream(entries: AsyncIterable<ZipEntry> | Iterable<ZipEntry>): Readable {
  const out = new PassThrough();
  const archive = new ZipArchive({ zlib: { level: 6 } });
  archive.on("error", (e: Error) => out.destroy(e));
  archive.pipe(out);
  (async () => {
    for await (const entry of entries) {
      const body = typeof entry.body === "function" ? await entry.body() : entry.body;
      // `once` rejects on an "error" event, so a failing body stream aborts the whole bundle.
      const written = once(archive, "entry");
      archive.append(body, { name: entry.name, ...(entry.date ? { date: entry.date } : {}) });
      await written;
    }
    await archive.finalize();
  })().catch((e: unknown) => {
    archive.abort();
    out.destroy(e instanceof Error ? e : new Error(String(e)));
  });
  return out;
}

/** Whole archive as a Buffer (tests). */
export async function zipBuffer(
  entries: AsyncIterable<ZipEntry> | Iterable<ZipEntry>,
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of zipStream(entries)) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

// ───────────────────────── documents bundle ─────────────────────────

export type BundleKind = "INVOICE" | "CREDIT_NOTE";

/**
 * `invoices/INV-26-27-001.pdf`; later versions carry a `-vN` suffix so every hash stays listed.
 * Numbers are unique per issuer profile only, so a bundle spanning several issuers passes the
 * issuer's label and gets `invoices/<issuer>/…`.
 */
export function documentFileName(
  kind: BundleKind,
  number: string,
  version: number,
  issuer?: string,
  extension: "pdf" | "docx" = "pdf",
  variant?: "facturx",
): string {
  const folder = kind === "INVOICE" ? "invoices" : "credit-notes";
  const suffix = version > 1 ? `-v${version}` : "";
  const issuerDir = issuer ? `${safeFileStem(issuer)}/` : "";
  const tag = variant ? `-${variant}` : "";
  return `${folder}/${issuerDir}${safeFileStem(number)}${suffix}${tag}.${extension}`;
}

export interface DocumentIndexRow extends Record<string, string | null> {
  kind: string;
  number: string;
  status: string;
  issueDate: string;
  issuer: string;
  client: string;
  currency: string;
  total: string;
  file: string;
  version: string;
  sha256: string;
}

export const DOCUMENT_INDEX_COLUMNS: Column<DocumentIndexRow>[] = [
  { key: "kind", header: "Kind", type: "string" },
  { key: "number", header: "Number", type: "string" },
  { key: "status", header: "Status", type: "string" },
  { key: "issueDate", header: "Issue date", type: "date" },
  { key: "issuer", header: "Issuer", type: "string" },
  { key: "client", header: "Client", type: "string" },
  { key: "currency", header: "Currency", type: "string" },
  { key: "total", header: "Total", type: "number" },
  { key: "file", header: "File", type: "string" },
  { key: "version", header: "Version", type: "number", numFmt: "0" },
  { key: "sha256", header: "SHA-256", type: "string" },
];

/** The `index.csv` of a documents bundle: the accountant's map from number to file and hash. */
export function documentsIndexCsv(rows: DocumentIndexRow[]): Promise<string> {
  return csvString(DOCUMENT_INDEX_COLUMNS, rows);
}
