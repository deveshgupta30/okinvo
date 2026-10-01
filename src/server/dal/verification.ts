import "server-only";
import { toDateString, type DateString } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { toMoneyString } from "@/lib/money";
import {
  ClientSnapshotSchema,
  CreditNoteSnapshotSchema,
  IssuerSnapshotSchema,
} from "@/lib/schemas";
import { parseSnapshot, tokenHash } from "./at-rest";

/** What the public page may show (SPEC §4.12): never payment status, never anything from drafts. */
export interface VerificationResult {
  kind: "INVOICE" | "CREDIT_NOTE";
  number: string;
  issuerLegalName: string;
  gstin?: string;
  clientName: string;
  issueDate: DateString;
  currency: string;
  total: string;
  locale: string;
  status: "valid" | "void";
  hashes: { version: number; sha256: string }[];
}

const TOKEN_RE = /^[A-Za-z0-9_-]{20,64}$/;

export async function lookupByToken(token: string): Promise<VerificationResult | null> {
  // The row stores the token's SHA-256. A malformed token still runs the same two lookups (for
  // a hash that cannot match) so the response time does not say which shape was tried.
  const wellFormed = TOKEN_RE.test(token);
  const hash = tokenHash(wellFormed ? token : "not-a-token");
  const invoice = await prisma.invoice.findUnique({
    where: { verificationToken: hash },
    select: {
      status: true,
      number: true,
      issueDate: true,
      currency: true,
      total: true,
      issuerSnapshot: true,
      clientSnapshot: true,
      documents: {
        where: { format: "PDF" },
        orderBy: { version: "asc" },
        select: { version: true, sha256: true },
      },
    },
  });
  if (wellFormed && invoice && invoice.status !== "DRAFT" && invoice.number) {
    const issuer = parseSnapshot(IssuerSnapshotSchema, invoice.issuerSnapshot);
    const client = parseSnapshot(ClientSnapshotSchema, invoice.clientSnapshot);
    return {
      kind: "INVOICE",
      number: invoice.number,
      issuerLegalName: issuer?.legalName ?? "",
      ...(issuer?.gstin ? { gstin: issuer.gstin } : {}),
      clientName: client?.displayName ?? "",
      issueDate: toDateString(invoice.issueDate),
      currency: invoice.currency,
      total: toMoneyString(invoice.total.toString(), invoice.currency),
      locale: issuer?.locale ?? "en-IN",
      status: invoice.status === "VOID" ? "void" : "valid",
      hashes: invoice.documents,
    };
  }
  const creditNote = await prisma.creditNote.findUnique({
    where: { verificationToken: hash },
    select: {
      status: true,
      number: true,
      issueDate: true,
      currency: true,
      total: true,
      snapshot: true,
      documents: {
        where: { format: "PDF" },
        orderBy: { version: "asc" },
        select: { version: true, sha256: true },
      },
    },
  });
  if (wellFormed && creditNote && creditNote.status !== "DRAFT" && creditNote.number) {
    const snap = parseSnapshot(CreditNoteSnapshotSchema, creditNote.snapshot);
    return {
      kind: "CREDIT_NOTE",
      number: creditNote.number,
      issuerLegalName: snap?.issuer?.legalName ?? "",
      ...(snap?.issuer?.gstin ? { gstin: snap.issuer.gstin } : {}),
      clientName: snap?.client?.displayName ?? "",
      issueDate: toDateString(creditNote.issueDate),
      currency: creditNote.currency,
      total: toMoneyString(creditNote.total.toString(), creditNote.currency),
      locale: snap?.issuer?.locale ?? "en-IN",
      status: creditNote.status === "VOID" ? "void" : "valid",
      hashes: creditNote.documents,
    };
  }
  return null;
}
