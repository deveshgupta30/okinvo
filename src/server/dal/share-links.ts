import "server-only";
import { createHmac } from "node:crypto";
import type { Readable } from "node:stream";
import type { DocumentKind } from "@/generated/prisma/client";
import { decryptField, encryptField, randomToken, sha256Hex } from "@/lib/crypto";
import { fieldKey } from "@/lib/crypto/key";
import { toDateString, type DateString } from "@/lib/dates";
import { prisma, type Tx } from "@/lib/db";
import { env } from "@/lib/env";
import { toMoneyString } from "@/lib/money";
import { LIMITS } from "@/lib/rate-limit";
import {
  ClientSnapshotSchema,
  CreditNoteSnapshotSchema,
  IssuerSnapshotSchema,
} from "@/lib/schemas";
import { hashPassword, verifyPassword } from "@/lib/security/password";
import { rateLimiter } from "@/server/rate-limit";
import type { Actor } from "@/server/actor";
import { parseSnapshot } from "./at-rest";
import { audit } from "./audit";
import { requireWriter } from "./authz";
import {
  ensureDocument,
  ensureProtectedDocument,
  getDocumentStream,
  type DocumentDto,
} from "./documents";
import { InvariantError, NotFoundError } from "./errors";

/**
 * Share links (spec §5.6): a public URL `/i/<token>` to an issued invoice or credit note, with an
 * optional password gate. The token is stored hashed (and encrypted, so the owner can copy the
 * URL again); a protected link carries its own password-protected PDF copy, and the canonical
 * PDF is never served through a protected link.
 */
export interface ShareLinkDto {
  id: string;
  kind: DocumentKind;
  documentId: string;
  url: string;
  protected: boolean;
  /** The viewer password, shown to the owner only (null for open links). */
  password: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  viewCount: number;
  downloadCount: number;
  lastViewedAt: string | null;
  createdAt: string;
}

/** What the public page may show: never payment status, never anything from drafts. */
export interface ShareView {
  linkId: string;
  kind: DocumentKind;
  documentId: string;
  number: string;
  status: "valid" | "void";
  requiresPassword: boolean;
  issuerLegalName: string;
  clientName: string;
  currency: string;
  total: string;
  issueDate: DateString;
  locale: string;
  expiresAt: string | null;
}

export type ExpiresInDays = 7 | 30 | 90 | null;

export interface CreateShareLinkInput {
  kind: DocumentKind;
  id: string;
  /** The viewer password; null or empty makes an open link. */
  password?: string | null | undefined;
  expiresInDays?: ExpiresInDays | undefined;
}

const TOKEN_RE = /^[A-Za-z0-9_-]{20,64}$/;

type Row = NonNullable<Awaited<ReturnType<typeof prisma.shareLink.findUnique>>>;

/** HMAC key for the share cookie, derived from the field key so no new secret is needed. */
export function shareCookieSecret(): Buffer {
  return createHmac("sha256", fieldKey()).update("okinvo.share-cookie").digest();
}

export function shareUrl(token: string): string {
  return `${env.APP_URL.replace(/\/$/, "")}/i/${token}`;
}

function toDto(row: Row): ShareLinkDto {
  const key = fieldKey();
  return {
    id: row.id,
    kind: row.kind,
    documentId: row.invoiceId ?? row.creditNoteId ?? "",
    url: shareUrl(decryptField(row.tokenEnc, key)),
    protected: row.passwordHash !== null,
    password: row.pdfPasswordEnc ? decryptField(row.pdfPasswordEnc, key) : null,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
    viewCount: row.viewCount,
    downloadCount: row.downloadCount,
    lastViewedAt: row.lastViewedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

async function issuedTarget(tx: Tx, kind: DocumentKind, id: string) {
  if (kind === "INVOICE") {
    const inv = await tx.invoice.findUnique({
      where: { id },
      select: { status: true, number: true },
    });
    if (!inv) throw new NotFoundError("Invoice", id);
    if (inv.status === "DRAFT") throw new InvariantError("Only issued documents can be shared.");
    return inv;
  }
  const cn = await tx.creditNote.findUnique({
    where: { id },
    select: { status: true, number: true },
  });
  if (!cn) throw new NotFoundError("CreditNote", id);
  if (cn.status === "DRAFT") throw new InvariantError("Only issued documents can be shared.");
  return cn;
}

export async function createShareLink(
  actor: Actor,
  input: CreateShareLinkInput,
): Promise<{ url: string; password: string | null; link: ShareLinkDto }> {
  requireWriter(actor);
  const password = input.password?.trim() ? input.password.trim() : null;
  const days = input.expiresInDays ?? null;
  if (days !== null && ![7, 30, 90].includes(days)) {
    throw new InvariantError("A share link expires in 7, 30 or 90 days, or never.");
  }
  const key = fieldKey();
  const token = randomToken(32);
  const ownerPassword = randomToken(24);
  const protectedDoc: DocumentDto | null = password
    ? await ensureProtectedDocument(actor, input.kind, input.id, {
        userPassword: password,
        ownerPassword,
      })
    : null;
  const row = await prisma.$transaction(async (tx) => {
    await issuedTarget(tx, input.kind, input.id);
    const created = await tx.shareLink.create({
      data: {
        kind: input.kind,
        ...(input.kind === "INVOICE" ? { invoiceId: input.id } : { creditNoteId: input.id }),
        tokenHash: sha256Hex(token),
        tokenEnc: encryptField(token, key),
        passwordHash: password ? await hashPassword(password) : null,
        pdfPasswordEnc: password ? encryptField(password, key) : null,
        ownerPasswordEnc: encryptField(ownerPassword, key),
        protectedDocumentId: protectedDoc?.id ?? null,
        expiresAt: days ? new Date(Date.now() + days * 86_400_000) : null,
        createdById: actor.userId,
      },
    });
    await audit(tx, actor, "share.created", "ShareLink", created.id, {
      summary: `Shared ${input.kind.toLowerCase()} ${protectedDoc ? "with a password" : "openly"}`,
      after: {
        kind: input.kind,
        documentId: input.id,
        protected: protectedDoc !== null,
        expiresAt: created.expiresAt,
      },
    });
    return created;
  });
  return { url: shareUrl(token), password, link: toDto(row) };
}

export async function revokeShareLink(actor: Actor, id: string): Promise<void> {
  requireWriter(actor);
  await prisma.$transaction(async (tx) => {
    const row = await tx.shareLink.findUnique({ where: { id } });
    if (!row) throw new NotFoundError("ShareLink", id);
    if (row.revokedAt) return;
    await tx.shareLink.update({ where: { id }, data: { revokedAt: new Date() } });
    await audit(tx, actor, "share.revoked", "ShareLink", id, {
      summary: "Revoked a share link",
      after: { documentId: row.invoiceId ?? row.creditNoteId },
    });
  });
}

export async function listShareLinks(
  _actor: Actor,
  kind: DocumentKind,
  id: string,
): Promise<ShareLinkDto[]> {
  const rows = await prisma.shareLink.findMany({
    where: kind === "INVOICE" ? { invoiceId: id } : { creditNoteId: id },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(toDto);
}

function isLive(row: Row, now: Date): boolean {
  if (row.revokedAt) return false;
  if (row.expiresAt && row.expiresAt.getTime() <= now.getTime()) return false;
  return true;
}

async function liveRow(token: string): Promise<Row | null> {
  // A malformed token still hashes and looks up so timing does not say which part failed.
  const hash = sha256Hex(TOKEN_RE.test(token) ? token : `invalid:${token.slice(0, 64)}`);
  const row = await prisma.shareLink.findUnique({ where: { tokenHash: hash } });
  return row && isLive(row, new Date()) ? row : null;
}

/** Public: the share view for a live link, or null for unknown, revoked and expired ones alike. */
export async function lookupShare(token: string): Promise<ShareView | null> {
  const row = await liveRow(token);
  if (!row) return null;
  const base = {
    linkId: row.id,
    kind: row.kind,
    requiresPassword: row.passwordHash !== null,
    expiresAt: row.expiresAt?.toISOString() ?? null,
  };
  if (row.kind === "INVOICE" && row.invoiceId) {
    const inv = await prisma.invoice.findUnique({
      where: { id: row.invoiceId },
      select: {
        status: true,
        number: true,
        issueDate: true,
        currency: true,
        total: true,
        issuerSnapshot: true,
        clientSnapshot: true,
      },
    });
    if (!inv || inv.status === "DRAFT" || !inv.number) return null;
    const issuer = parseSnapshot(IssuerSnapshotSchema, inv.issuerSnapshot);
    const client = parseSnapshot(ClientSnapshotSchema, inv.clientSnapshot);
    return {
      ...base,
      documentId: row.invoiceId,
      number: inv.number,
      status: inv.status === "VOID" ? "void" : "valid",
      issuerLegalName: issuer?.legalName ?? "",
      clientName: client?.displayName ?? "",
      currency: inv.currency,
      total: toMoneyString(inv.total.toString(), inv.currency),
      issueDate: toDateString(inv.issueDate),
      locale: issuer?.locale ?? "en-IN",
    };
  }
  if (row.kind === "CREDIT_NOTE" && row.creditNoteId) {
    const cn = await prisma.creditNote.findUnique({
      where: { id: row.creditNoteId },
      select: {
        status: true,
        number: true,
        issueDate: true,
        currency: true,
        total: true,
        snapshot: true,
      },
    });
    if (!cn || cn.status === "DRAFT" || !cn.number) return null;
    const snap = parseSnapshot(CreditNoteSnapshotSchema, cn.snapshot);
    return {
      ...base,
      documentId: row.creditNoteId,
      number: cn.number,
      status: cn.status === "VOID" ? "void" : "valid",
      issuerLegalName: snap?.issuer?.legalName ?? "",
      clientName: snap?.client?.displayName ?? "",
      currency: cn.currency,
      total: toMoneyString(cn.total.toString(), cn.currency),
      issueDate: toDateString(cn.issueDate),
      locale: snap?.issuer?.locale ?? "en-IN",
    };
  }
  return null;
}

export type PasswordCheck = "ok" | "wrong" | "rate_limited" | "open";

/**
 * Checks a viewer's password. Attempts are rate-limited per link and caller (`subject`, the
 * client IP): after `LIMITS.sharePassword.limit` wrong tries in the window the answer is
 * `rate_limited` whatever the password, so a guess never learns anything past the fifth try.
 */
export async function verifySharePassword(
  linkId: string,
  password: string,
  subject: string,
): Promise<PasswordCheck> {
  const row = await prisma.shareLink.findUnique({ where: { id: linkId } });
  if (!row || !isLive(row, new Date())) return "wrong";
  if (!row.passwordHash) return "open";
  const { limit, windowMs } = LIMITS.sharePassword;
  const decision = await rateLimiter.hit(`sharePassword:${linkId}:${subject}`, limit, windowMs);
  if (!decision.allowed) return "rate_limited";
  return (await verifyPassword(password, row.passwordHash)) ? "ok" : "wrong";
}

export async function recordShareView(linkId: string, what: "view" | "download"): Promise<void> {
  await prisma.shareLink.update({
    where: { id: linkId },
    data: {
      lastViewedAt: new Date(),
      ...(what === "view" ? { viewCount: { increment: 1 } } : { downloadCount: { increment: 1 } }),
    },
  });
}

/**
 * The file a share link serves: the link's own password-protected copy when it has a password,
 * else the canonical PDF (rendered on first demand). A protected link never streams the
 * canonical file.
 */
export async function shareDocumentStream(
  linkId: string,
): Promise<{ document: DocumentDto; stream: Readable }> {
  const row = await prisma.shareLink.findUnique({ where: { id: linkId } });
  if (!row || !isLive(row, new Date())) throw new NotFoundError("ShareLink", linkId);
  const documentId = row.invoiceId ?? row.creditNoteId ?? "";
  const systemActor: Actor = {
    userId: row.createdById,
    email: "",
    name: "share link",
    role: "VIEWER",
    timezone: "UTC",
  };
  if (row.passwordHash) {
    if (!row.protectedDocumentId) throw new NotFoundError("Document", linkId);
    return getDocumentStream(systemActor, row.protectedDocumentId);
  }
  const doc = await ensureDocument(row.kind, documentId);
  return getDocumentStream(systemActor, doc.id);
}
