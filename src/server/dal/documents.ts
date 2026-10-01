import "server-only";
import type { Readable } from "node:stream";
import { Prisma } from "@/generated/prisma/client";
import { sha256Hex } from "@/lib/crypto";
import { todayIn } from "@/lib/dates";
import { prisma, type Tx } from "@/lib/db";
import { qrDataUrl } from "@/lib/documents/qr";
import { renderPdf } from "@/lib/documents/render";
import { sampleViewModel } from "@/lib/documents/sample";
import { buildDocumentViewModel, type RenderInput } from "@/lib/documents/view-model";
import { env } from "@/lib/env";
import { buildSnapshots } from "@/lib/invoices/snapshots";
import { safeFileStem } from "@/lib/numbering";
import { mergeDisplayConfig, paymentMethodLines, type TemplateConfig } from "@/lib/schemas";
import { documentKey, storage } from "@/lib/storage";
import type { Actor } from "@/server/actor";
import { readAssetBytes } from "./assets";
import { audit } from "./audit";
import { InvariantError, NotFoundError } from "./errors";
import { creditNoteRenderInputFromSnapshot } from "@/lib/credit-notes/preview";
import { getCreditNoteTx } from "./credit-notes";
import { getInvoiceTx, type InvoiceDto } from "./invoices";
import { decryptDetails } from "./payment-methods";
import { resolveTemplateConfig } from "./templates";

export type DocumentKind = "INVOICE" | "CREDIT_NOTE";

export interface DocumentDto {
  id: string;
  kind: DocumentKind;
  version: number;
  storageKey: string;
  sha256: string;
  byteSize: number;
  generatedAt: string;
  filename: string;
}

export const assetUrl = (assetId: string) => `/api/assets/id/${assetId}`;

/** Another render already stored this version's blob (concurrent first render). */
export class DocumentExistsError extends InvariantError {
  constructor(key: string) {
    super(`A document already exists at ${key}; refusing to overwrite it.`);
    this.name = "DocumentExistsError";
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function bytesOf(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

/** An issued invoice DTO → renderer input (snapshots are authoritative; live rows are ignored). */
export function renderInputFromInvoice(inv: InvoiceDto): RenderInput {
  if (!inv.issuerSnapshot || !inv.clientSnapshot) {
    throw new InvariantError("This invoice has no snapshots; only issued invoices render.");
  }
  return {
    kind: "INVOICE",
    status: inv.status,
    number: inv.number,
    issueDate: inv.issueDate,
    dueDate: inv.dueDate,
    currency: inv.currency,
    locale: inv.issuerSnapshot.locale,
    issuer: inv.issuerSnapshot,
    client: inv.clientSnapshot,
    paymentMethods: inv.paymentMethodsSnapshot ?? [],
    taxRegime: inv.taxRegime,
    supplyType: inv.supplyType,
    placeOfSupply: inv.placeOfSupply,
    isReverseCharge: inv.isReverseCharge,
    lutNumber: inv.lutNumber,
    items: inv.items,
    taxLines: inv.taxLines,
    subtotal: inv.subtotal,
    discountType: inv.discountType,
    discountValue: inv.discountValue,
    discountAmount: inv.discountAmount,
    taxableAmount: inv.taxableAmount,
    taxAmount: inv.taxAmount,
    roundingAdjustment: inv.roundingAdjustment,
    total: inv.total,
    tdsRate: inv.tdsRate,
    tdsExpected: inv.tdsExpected,
    poReference: inv.poReference,
    notes: inv.notes,
    terms: inv.terms,
    displayConfig: inv.displayConfig,
    replaces: inv.replaces,
    verificationToken: inv.verificationToken,
  };
}

/** Draft invoices render from the live profile, client, methods and template (SPEC §4.6). */
export async function renderInputForDraft(tx: Tx, inv: InvoiceDto): Promise<RenderInput> {
  const [issuer, client, links] = await Promise.all([
    tx.issuerProfile.findUniqueOrThrow({ where: { id: inv.issuerProfileId } }),
    tx.client.findUniqueOrThrow({ where: { id: inv.clientId } }),
    tx.invoicePaymentMethod.findMany({
      where: { invoiceId: inv.id },
      include: { paymentMethod: true },
      orderBy: { position: "asc" },
    }),
  ]);
  const display = mergeDisplayConfig(inv.displayConfig);
  const snap = buildSnapshots({
    issuer: {
      ...issuer,
      address: issuer.address as RenderInput["issuer"] extends never ? never : never,
    },
    client: {
      ...client,
      billingAddress: client.billingAddress as never,
      shippingAddress: (client.shippingAddress as never) ?? null,
    },
    methods: links.map((l) => ({
      name: l.paymentMethod.name,
      type: l.paymentMethod.type,
      instructions: l.paymentMethod.instructions,
      lines: paymentMethodLines(decryptDetails(l.paymentMethod.detailsEnc)),
    })),
    display,
    lutApplies: inv.supplyType === "EXPORT_LUT",
  });
  return {
    ...renderInputFromInvoice({
      ...inv,
      issuerSnapshot: snap.issuer,
      clientSnapshot: snap.client,
      paymentMethodsSnapshot: snap.paymentMethods,
    }),
    status: "DRAFT",
    number: null,
  };
}

function filenameFor(kind: DocumentKind, number: string | null, version: number): string {
  const stem = number
    ? safeFileStem(number)
    : kind === "INVOICE"
      ? "invoice-draft"
      : "credit-note-draft";
  return version > 1 ? `${stem}-v${version}.pdf` : `${stem}.pdf`;
}

type DocRow = Prisma.DocumentGetPayload<object>;

function toDto(row: DocRow, number: string | null): DocumentDto {
  return {
    id: row.id,
    kind: row.kind,
    version: row.version,
    storageKey: row.storageKey,
    sha256: row.sha256,
    byteSize: row.byteSize,
    generatedAt: row.generatedAt.toISOString(),
    filename: filenameFor(row.kind, number, row.version),
  };
}

async function latestDocument(tx: Tx, kind: DocumentKind, id: string): Promise<DocRow | null> {
  return tx.document.findFirst({
    where:
      kind === "INVOICE" ? { invoiceId: id, format: "PDF" } : { creditNoteId: id, format: "PDF" },
    orderBy: { version: "desc" },
  });
}

async function loadIssued(tx: Tx, kind: DocumentKind, id: string, today: string) {
  if (kind === "CREDIT_NOTE") {
    const cn = await getCreditNoteTx(tx, id);
    if (cn.status === "DRAFT") throw new InvariantError("Drafts are previewed, never stored.");
    return {
      input: creditNoteRenderInputFromSnapshot(cn),
      config: cn.templateSnapshot ?? (await resolveTemplateConfig(tx, cn.issuerProfileId)),
      number: cn.number,
      issuerProfileId: cn.issuerProfileId,
      fiscalYear: cn.fiscalYear ?? "unknown",
      issuedAt: cn.issuedAt ? new Date(cn.issuedAt) : new Date(0),
    };
  }
  const inv = await getInvoiceTx(tx, id, today);
  if (inv.status === "DRAFT") throw new InvariantError("Drafts are previewed, never stored.");
  return {
    input: renderInputFromInvoice(inv),
    config: inv.templateSnapshot ?? (await resolveTemplateConfig(tx, inv.issuerProfileId)),
    number: inv.number,
    issuerProfileId: inv.issuerProfileId,
    fiscalYear: inv.fiscalYear ?? "unknown",
    issuedAt: inv.issuedAt ? new Date(inv.issuedAt) : new Date(0),
  };
}

async function renderStored(
  tx: Tx,
  kind: DocumentKind,
  id: string,
  version: number,
): Promise<DocRow> {
  const today = todayIn("UTC");
  const doc = await loadIssued(tx, kind, id, today);
  const vm = buildDocumentViewModel(doc.input, {
    appUrl: env.APP_URL,
    assetUrl,
    config: doc.config,
    draft: false,
  });
  const pdf = await renderPdf(vm, doc.config, { assets: readAssetBytes, createdAt: doc.issuedAt });
  const sha256 = sha256Hex(pdf);
  const key = documentKey(
    kind,
    doc.issuerProfileId,
    doc.fiscalYear.toLowerCase(),
    safeFileStem(doc.number ?? id).toLowerCase(),
    version,
  );
  // Stored documents are immutable: never overwrite a blob that already exists at this key. A
  // blob with no row (a crash between put and insert, or a concurrent first render) is adopted
  // when it is byte-identical to this render — renders are deterministic — else refused.
  if (await storage.exists(key)) {
    const existing = await bytesOf((await storage.get(key)).stream);
    if (sha256Hex(existing) !== sha256) throw new DocumentExistsError(key);
  } else {
    await storage.put(key, pdf, { contentType: "application/pdf", byteSize: pdf.length });
  }
  return tx.document.create({
    data: {
      kind,
      format: "PDF",
      version,
      ...(kind === "INVOICE" ? { invoiceId: id } : { creditNoteId: id }),
      templateId: doc.config.templateId,
      storageKey: key,
      sha256,
      byteSize: pdf.length,
    },
  });
}

/**
 * Idempotent: returns the stored PDF for an issued/void document, rendering and storing it on
 * first call. Two concurrent first calls both render; the unique (invoiceId, format, version)
 * constraint makes the loser re-read the winner's row (v2 §12.3).
 */
export async function ensureDocument(kind: DocumentKind, id: string): Promise<DocumentDto> {
  const existing = await latestDocument(prisma, kind, id);
  const numberOf = async () =>
    kind === "INVOICE"
      ? ((await prisma.invoice.findUnique({ where: { id }, select: { number: true } }))?.number ??
        null)
      : ((await prisma.creditNote.findUnique({ where: { id }, select: { number: true } }))
          ?.number ?? null);
  if (existing) return toDto(existing, await numberOf());
  try {
    const row = await renderStored(prisma, kind, id, 1);
    return toDto(row, await numberOf());
  } catch (e) {
    const lostRace =
      e instanceof DocumentExistsError ||
      (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002");
    if (lostRace) {
      // The winner wrote the blob first and its row follows within milliseconds; wait for it.
      for (let attempt = 0; attempt < 25; attempt++) {
        const row = await latestDocument(prisma, kind, id);
        if (row) return toDto(row, await numberOf());
        await sleep(200);
      }
    }
    throw e;
  }
}

/** A new version (SPEC §4.6 "documents"): earlier versions stay, the verify page lists every hash. */
export async function regenerateDocument(
  actor: Actor,
  kind: DocumentKind,
  id: string,
): Promise<DocumentDto> {
  // The row and its audit event land together: a failed render leaves neither.
  const row = await prisma.$transaction(
    async (tx) => {
      const latest = await latestDocument(tx, kind, id);
      const version = (latest?.version ?? 0) + 1;
      const created = await renderStored(tx, kind, id, version);
      await audit(tx, actor, "document.regenerated", "Document", created.id, {
        summary: `Regenerated ${kind.toLowerCase()} PDF v${version}`,
        after: { version, sha256: created.sha256 },
      });
      return created;
    },
    { maxWait: 15_000, timeout: 60_000 },
  );
  return toDto(row, await documentNumber(kind, id));
}

async function documentNumber(kind: DocumentKind, id: string): Promise<string | null> {
  if (kind === "INVOICE") {
    return (
      (await prisma.invoice.findUnique({ where: { id }, select: { number: true } }))?.number ?? null
    );
  }
  return (
    (await prisma.creditNote.findUnique({ where: { id }, select: { number: true } }))?.number ??
    null
  );
}

export async function getDocumentStream(
  _actor: Actor,
  documentId: string,
): Promise<{ document: DocumentDto; stream: Readable }> {
  const row = await prisma.document.findUnique({
    where: { id: documentId },
    include: { invoice: { select: { number: true } }, creditNote: { select: { number: true } } },
  });
  if (!row) throw new NotFoundError("Document", documentId);
  const obj = await storage.get(row.storageKey);
  return {
    document: toDto(row, row.invoice?.number ?? row.creditNote?.number ?? null),
    stream: obj.stream,
  };
}

/** Watermarked draft credit-note preview from the invoice's snapshots; never stored. */
export async function renderCreditNoteDraftPreview(
  actor: Actor,
  creditNoteId: string,
): Promise<Buffer> {
  const cn = await getCreditNoteTx(prisma, creditNoteId);
  if (cn.status !== "DRAFT")
    throw new InvariantError("Only drafts are previewed; download the stored PDF.");
  const inv = await getInvoiceTx(prisma, cn.invoiceId, todayIn(actor.timezone));
  const { creditNoteRenderInput } = await import("@/lib/credit-notes/preview");
  const input = creditNoteRenderInput({
    invoice: inv,
    reason: cn.reason,
    subtotal: cn.subtotal,
    issueDate: cn.issueDate,
    displayConfig: cn.displayConfig,
    status: "DRAFT",
  });
  const config = await resolveTemplateConfig(prisma, cn.issuerProfileId);
  const vm = buildDocumentViewModel(input, { appUrl: env.APP_URL, assetUrl, config, draft: true });
  return renderPdf(vm, config, { assets: readAssetBytes });
}

/** Watermarked draft preview, never stored (SPEC §4.6). */
export async function renderDraftPreview(actor: Actor, invoiceId: string): Promise<Buffer> {
  const inv = await getInvoiceTx(prisma, invoiceId, todayIn(actor.timezone));
  if (inv.status !== "DRAFT")
    throw new InvariantError("Only drafts are previewed; download the stored PDF.");
  const input = await renderInputForDraft(prisma, inv);
  const config = await resolveTemplateConfig(prisma, inv.issuerProfileId);
  const vm = buildDocumentViewModel(input, { appUrl: env.APP_URL, assetUrl, config, draft: true });
  return renderPdf(vm, config, { assets: readAssetBytes });
}

/** Settings → Templates sample PDF for any config (not necessarily the saved one). */
export async function renderSamplePdf(config: TemplateConfig): Promise<Buffer> {
  const vm = sampleViewModel(config);
  const withQr = vm.verifyUrl ? { ...vm, qrDataUrl: await qrDataUrl(vm.verifyUrl) } : vm;
  return renderPdf(withQr, config, { assets: async () => null });
}

/** The QR for an issued invoice's on-screen preview. */
export async function verificationQr(verifyUrl: string): Promise<string> {
  return qrDataUrl(verifyUrl);
}
