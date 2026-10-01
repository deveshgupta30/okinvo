import "server-only";
import { toDateString, type DateString } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { toMoneyString } from "@/lib/money";
import type { ClientSnapshot, IssuerSnapshot } from "@/lib/schemas";

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
  if (!TOKEN_RE.test(token)) return null;
  const invoice = await prisma.invoice.findUnique({
    where: { verificationToken: token },
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
  if (invoice && invoice.status !== "DRAFT" && invoice.number) {
    const issuer = invoice.issuerSnapshot as IssuerSnapshot | null;
    const client = invoice.clientSnapshot as ClientSnapshot | null;
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
    where: { verificationToken: token },
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
  if (creditNote && creditNote.status !== "DRAFT" && creditNote.number) {
    const snap = creditNote.snapshot as { issuer?: IssuerSnapshot; client?: ClientSnapshot } | null;
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
