import "server-only";
import type { Readable } from "node:stream";
import { Prisma, type DocumentFormat } from "@/generated/prisma/client";
import { sha256Hex } from "@/lib/crypto";
import { todayIn } from "@/lib/dates";
import { prisma, type Tx } from "@/lib/db";
import { qrDataUrl } from "@/lib/documents/qr";
import type { ProtectOptions } from "@/lib/documents/protect";
import { renderDocx } from "@/lib/documents/docx/render";
import { renderPdf } from "@/lib/documents/render";
import { sampleViewModel } from "@/lib/documents/sample";
import {
  buildDocumentViewModel,
  type DocumentViewModel,
  type RenderInput,
} from "@/lib/documents/view-model";
import { env } from "@/lib/env";
import { documentMessages } from "@/lib/i18n/document-messages";
import { buildSnapshots } from "@/lib/invoices/snapshots";
import { safeFileStem } from "@/lib/numbering";
import {
  AddressSchema,
  mergeDisplayConfig,
  paymentMethodLines,
  type TemplateConfig,
} from "@/lib/schemas";
import { documentKey, storage } from "@/lib/storage";
import type { Actor } from "@/server/actor";
import { readAssetBytes } from "./assets";
import { audit } from "./audit";
import { InvariantError, NotFoundError } from "./errors";
import { requireWriter } from "./authz";
import { creditNoteRenderInputFromSnapshot } from "@/lib/credit-notes/preview";
import { getCreditNoteTx } from "./credit-notes";
import { getInvoiceTx, type InvoiceDto } from "./invoices";
import { decryptDetails } from "./payment-methods";
import { resolveTemplateConfig } from "./templates";

export type DocumentKind = "INVOICE" | "CREDIT_NOTE";

export interface DocumentDto {
  id: string;
  kind: DocumentKind;
  /** PDF is the canonical copy; PDF_PROTECTED copies are encrypted per request (spec §5.5). */
  format: DocumentFormat;
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
    locale: inv.documentLocale,
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
    einvoice: inv.einvoice,
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
      address: AddressSchema.parse(issuer.address),
    },
    client: {
      ...client,
      billingAddress: AddressSchema.parse(client.billingAddress),
      shippingAddress: client.shippingAddress ? AddressSchema.parse(client.shippingAddress) : null,
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

function filenameFor(
  kind: DocumentKind,
  number: string | null,
  version: number,
  format: DocumentFormat = "PDF",
): string {
  const stem = number
    ? safeFileStem(number)
    : kind === "INVOICE"
      ? "invoice-draft"
      : "credit-note-draft";
  const suffix = format === "PDF_PROTECTED" ? "-protected" : "";
  const extension = format === "DOCX" ? "docx" : "pdf";
  return version > 1
    ? `${stem}-v${version}${suffix}.${extension}`
    : `${stem}${suffix}.${extension}`;
}

type DocRow = Prisma.DocumentGetPayload<object>;

function toDto(row: DocRow, number: string | null): DocumentDto {
  return {
    id: row.id,
    kind: row.kind,
    format: row.format,
    version: row.version,
    storageKey: row.storageKey,
    sha256: row.sha256,
    byteSize: row.byteSize,
    generatedAt: row.generatedAt.toISOString(),
    filename: filenameFor(row.kind, number, row.version, row.format),
  };
}

async function latestDocument(
  tx: Tx,
  kind: DocumentKind,
  id: string,
  format: DocumentFormat = "PDF",
): Promise<DocRow | null> {
  return tx.document.findFirst({
    where: kind === "INVOICE" ? { invoiceId: id, format } : { creditNoteId: id, format },
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
  protect?: ProtectOptions,
  format: "PDF" | "DOCX" = "PDF",
): Promise<DocRow> {
  const today = todayIn("UTC");
  const doc = await loadIssued(tx, kind, id, today);
  const vm = buildDocumentViewModel(doc.input, {
    appUrl: env.APP_URL,
    assetUrl,
    config: doc.config,
    draft: false,
    messages: await documentMessages(doc.input.locale),
  });
  const pdf =
    format === "DOCX"
      ? await renderDocx(
          vm.qrText ? { ...vm, qrDataUrl: await qrDataUrl(vm.qrText) } : vm,
          doc.config,
          await docxImages(vm, doc.config),
        )
      : await renderPdf(vm, doc.config, {
          assets: readAssetBytes,
          createdAt: doc.issuedAt,
          ...(protect ? { protect } : {}),
        });
  const contentType =
    format === "DOCX"
      ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      : "application/pdf";
  const sha256 = sha256Hex(pdf);
  const key = documentKey(
    kind,
    doc.issuerProfileId,
    doc.fiscalYear.toLowerCase(),
    safeFileStem(doc.number ?? id).toLowerCase(),
    version,
    {
      ...(protect ? { suffix: "protected" } : {}),
      ...(format === "DOCX" ? { extension: "docx" } : {}),
    },
  );
  // Stored documents are immutable: never overwrite a blob that already exists at this key. A
  // blob with no row (a crash between put and insert, or a concurrent first render) is adopted
  // when it is byte-identical to this render — renders are deterministic — else refused.
  // Encrypted copies are never byte-identical (fresh encryption each time), so an existing blob
  // at a protected key is always a refusal (R9).
  if (await storage.exists(key)) {
    const existing = protect ? null : await bytesOf((await storage.get(key)).stream);
    if (!existing || sha256Hex(existing) !== sha256) throw new DocumentExistsError(key);
  } else {
    await storage.put(key, pdf, { contentType, byteSize: pdf.length });
  }
  return tx.document.create({
    data: {
      kind,
      format: protect ? "PDF_PROTECTED" : format,
      version,
      ...(kind === "INVOICE" ? { invoiceId: id } : { creditNoteId: id }),
      templateId: doc.config.templateId,
      storageKey: key,
      sha256,
      byteSize: pdf.length,
    },
  });
}

/** The issuer's images and the header image as bytes for the DOCX writer (missing = omitted). */
async function docxImages(vm: DocumentViewModel, config: TemplateConfig) {
  const read = async (assetId: string | undefined) =>
    assetId ? ((await readAssetBytes(assetId)) ?? undefined) : undefined;
  const [logo, signature, stamp, header] = await Promise.all([
    read(vm.showLogo ? vm.issuer.logoAssetId : undefined),
    read(vm.showSignature ? vm.issuer.signatureAssetId : undefined),
    read(vm.showStamp ? vm.issuer.stampAssetId : undefined),
    read(config.header.style === "image" ? config.header.imageAssetId : undefined),
  ]);
  return {
    ...(logo ? { logo } : {}),
    ...(signature ? { signature } : {}),
    ...(stamp ? { stamp } : {}),
    ...(header ? { header } : {}),
  };
}

/**
 * Idempotent: returns the stored PDF (or, with `format: "DOCX"`, the DOCX copy) for an
 * issued/void document, rendering and storing it on first call. Two concurrent first calls both render; the unique (invoiceId, format, version)
 * constraint makes the loser re-read the winner's row (v2 §12.3).
 */
export async function ensureDocument(
  kind: DocumentKind,
  id: string,
  o: { format?: "PDF" | "DOCX" } = {},
): Promise<DocumentDto> {
  const format = o.format ?? "PDF";
  const existing = await latestDocument(prisma, kind, id, format);
  const numberOf = async () =>
    kind === "INVOICE"
      ? ((await prisma.invoice.findUnique({ where: { id }, select: { number: true } }))?.number ??
        null)
      : ((await prisma.creditNote.findUnique({ where: { id }, select: { number: true } }))
          ?.number ?? null);
  if (existing) return toDto(existing, await numberOf());
  try {
    const row = await renderStored(prisma, kind, id, 1, undefined, format);
    return toDto(row, await numberOf());
  } catch (e) {
    const lostRace =
      e instanceof DocumentExistsError ||
      (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002");
    if (lostRace) {
      // The winner wrote the blob first and its row follows within milliseconds; wait for it.
      for (let attempt = 0; attempt < 25; attempt++) {
        const row = await latestDocument(prisma, kind, id, format);
        if (row) return toDto(row, await numberOf());
        await sleep(200);
      }
    }
    throw e;
  }
}

/**
 * A password-protected copy (spec §5.5): a new PDF_PROTECTED version rendered from the same
 * snapshot and AES-256 encrypted — opens with the user password, prints, nothing else. The
 * canonical PDF is untouched; each call makes a fresh copy (and version) because the recipient's
 * password differs. Passwords never reach the audit log.
 */
export async function ensureProtectedDocument(
  actor: Actor,
  kind: DocumentKind,
  id: string,
  protect: ProtectOptions,
): Promise<DocumentDto> {
  requireWriter(actor);
  if (!protect.userPassword || !protect.ownerPassword) {
    throw new InvariantError("A protected copy needs a user password and an owner password.");
  }
  const row = await prisma.$transaction(
    async (tx) => {
      const latest = await latestDocument(tx, kind, id, "PDF_PROTECTED");
      const version = (latest?.version ?? 0) + 1;
      const created = await renderStored(tx, kind, id, version, protect);
      await audit(tx, actor, "document.protected", "Document", created.id, {
        summary: `Password-protected ${kind.toLowerCase()} copy v${version}`,
        after: { version, sha256: created.sha256, format: "PDF_PROTECTED" },
      });
      return created;
    },
    { maxWait: 15_000, timeout: 60_000 },
  );
  return toDto(row, await documentNumber(kind, id));
}

/** A new version (SPEC §4.6 "documents"): earlier versions stay, the verify page lists every hash. */
export async function regenerateDocument(
  actor: Actor,
  kind: DocumentKind,
  id: string,
): Promise<DocumentDto> {
  requireWriter(actor);
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
  const vm = buildDocumentViewModel(input, {
    appUrl: env.APP_URL,
    assetUrl,
    config,
    draft: true,
    messages: await documentMessages(input.locale),
  });
  return renderPdf(vm, config, { assets: readAssetBytes });
}

/** Watermarked draft preview, never stored (SPEC §4.6). */
export async function renderDraftPreview(actor: Actor, invoiceId: string): Promise<Buffer> {
  const inv = await getInvoiceTx(prisma, invoiceId, todayIn(actor.timezone));
  if (inv.status !== "DRAFT")
    throw new InvariantError("Only drafts are previewed; download the stored PDF.");
  const input = await renderInputForDraft(prisma, inv);
  const config = await resolveTemplateConfig(prisma, inv.issuerProfileId);
  const vm = buildDocumentViewModel(input, {
    appUrl: env.APP_URL,
    assetUrl,
    config,
    draft: true,
    messages: await documentMessages(input.locale),
  });
  return renderPdf(vm, config, { assets: readAssetBytes });
}

/**
 * The HTML view of an issued document (view-model + the config it was issued with, QR filled).
 * `inlineImages` embeds the issuer's images and the header image as data URLs for pages that
 * cannot reach the session-gated asset route (the public share page).
 */
export async function issuedDocumentView(
  kind: DocumentKind,
  id: string,
  o: { inlineImages?: boolean } = {},
): Promise<{ vm: DocumentViewModel; config: TemplateConfig }> {
  const doc = await loadIssued(prisma, kind, id, todayIn("UTC"));
  const inline = new Map<string, string>();
  if (o.inlineImages) {
    const ids = [
      doc.input.issuer.logoAssetId,
      doc.input.issuer.signatureAssetId,
      doc.input.issuer.stampAssetId,
      doc.config.header.style === "image" ? doc.config.header.imageAssetId : undefined,
    ].filter((x): x is string => typeof x === "string" && x.length > 0);
    for (const assetId of ids) {
      const bytes = await readAssetBytes(assetId);
      if (bytes) inline.set(assetId, `data:image/png;base64,${bytes.toString("base64")}`);
    }
  }
  const vm = buildDocumentViewModel(doc.input, {
    appUrl: env.APP_URL,
    assetUrl: (assetId) => inline.get(assetId) ?? assetUrl(assetId),
    config: doc.config,
    draft: false,
    messages: await documentMessages(doc.input.locale),
  });
  const withQr = vm.qrText ? { ...vm, qrDataUrl: await qrDataUrl(vm.qrText) } : vm;
  return { vm: withQr, config: doc.config };
}

/** Settings → Templates sample PDF for any config (not necessarily the saved one). */
export async function renderSamplePdf(config: TemplateConfig): Promise<Buffer> {
  const vm = sampleViewModel(config);
  const withQr = vm.qrText ? { ...vm, qrDataUrl: await qrDataUrl(vm.qrText) } : vm;
  return renderPdf(withQr, config, { assets: readAssetBytes });
}

/** The QR for an issued invoice's on-screen preview. */
export async function verificationQr(verifyUrl: string): Promise<string> {
  return qrDataUrl(verifyUrl);
}
