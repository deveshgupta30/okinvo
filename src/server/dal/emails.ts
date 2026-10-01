import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { todayIn } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { sendMail } from "@/lib/email/send";
import {
  DEFAULT_TEMPLATES,
  buildMailto,
  renderTemplate,
  textToHtml,
  type TemplateVars,
} from "@/lib/email/templates";
import { env } from "@/lib/env";
import { formatDate, formatMoney } from "@/lib/format";
import { LIMITS } from "@/lib/rate-limit";
import { parseEmailList } from "@/lib/schemas";
import type { SendEmailInput } from "@/lib/schemas/email-input";
import type { Actor } from "@/server/actor";
import { rateLimiter } from "@/server/rate-limit";
import { audit } from "./audit";
import { getCreditNoteTx, setCreditNoteSentAtIfUnset } from "./credit-notes";
import { ensureDocument, getDocumentStream, type DocumentKind } from "./documents";
import { InvariantError } from "./errors";
import { getInvoiceTx, setSentAtIfUnset } from "./invoices";
import { getEmailDefaults, resolveSmtp } from "./smtp-settings";

export interface ComposerDefaults {
  kind: DocumentKind;
  id: string;
  number: string;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  body: string;
  attachmentName: string;
  smtpAvailable: boolean;
  smtpSource: "settings" | "env" | null;
  mailto: string;
  sentAt: string | null;
  backHref: string;
}

export interface EmailMessageDto {
  id: string;
  kind: DocumentKind;
  invoiceId: string | null;
  creditNoteId: string | null;
  documentId: string | null;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  bodyText: string;
  status: "SENT" | "FAILED" | "MANUAL";
  providerMessageId: string | null;
  error: string | null;
  createdAt: string;
  documentNumber: string | null;
}

type Row = Prisma.EmailMessageGetPayload<{
  include: { invoice: { select: { number: true } }; creditNote: { select: { number: true } } };
}>;

function toDto(row: Row): EmailMessageDto {
  return {
    id: row.id,
    kind: row.kind,
    invoiceId: row.invoiceId,
    creditNoteId: row.creditNoteId,
    documentId: row.documentId,
    to: row.to,
    cc: row.cc,
    bcc: row.bcc,
    subject: row.subject,
    bodyText: row.bodyText,
    status: row.status,
    providerMessageId: row.providerMessageId,
    error: row.error,
    createdAt: row.createdAt.toISOString(),
    documentNumber: row.invoice?.number ?? row.creditNote?.number ?? null,
  };
}

interface DocumentContext {
  number: string;
  vars: TemplateVars;
  clientEmail: string | null;
  profile: {
    id: string;
    emailCc: string | null;
    emailBcc: string | null;
    subjectTemplate: string | null;
    bodyTemplate: string | null;
  };
  sentAt: string | null;
  backHref: string;
}

async function documentContext(
  actor: Actor,
  kind: DocumentKind,
  id: string,
): Promise<DocumentContext> {
  const today = todayIn(actor.timezone);
  const verify = (token: string) => `${env.APP_URL.replace(/\/$/, "")}/verify/${token}`;
  if (kind === "INVOICE") {
    const inv = await getInvoiceTx(prisma, id, today);
    if (inv.status === "DRAFT" || !inv.number)
      throw new InvariantError("Issue the invoice before sending it.");
    if (inv.status === "VOID") throw new InvariantError("This invoice is void and cannot be sent.");
    const profile = await prisma.issuerProfile.findUniqueOrThrow({
      where: { id: inv.issuerProfileId },
    });
    return {
      number: inv.number,
      vars: {
        number: inv.number,
        issuerName: inv.issuerSnapshot?.legalName ?? inv.issuer.legalName,
        clientName: inv.clientSnapshot?.displayName ?? inv.clientName,
        contactPerson: inv.clientSnapshot?.contactPerson ?? inv.clientName,
        issueDate: formatDate(inv.issueDate, inv.locale),
        dueDate: formatDate(inv.dueDate, inv.locale),
        total: formatMoney(inv.total, inv.currency, inv.locale),
        balanceDue: formatMoney(inv.balanceDue, inv.currency, inv.locale),
        currency: inv.currency,
        paymentTerms: `${inv.client.paymentTermsDays} days`,
        verifyUrl: verify(inv.verificationToken),
      },
      clientEmail: inv.clientSnapshot?.email ?? inv.client.email,
      profile: {
        id: profile.id,
        emailCc: profile.emailCc,
        emailBcc: profile.emailBcc,
        subjectTemplate: profile.emailInvoiceSubject,
        bodyTemplate: profile.emailInvoiceBody,
      },
      sentAt: inv.sentAt,
      backHref: `/invoices/${id}`,
    };
  }
  const cn = await getCreditNoteTx(prisma, id);
  if (cn.status === "DRAFT" || !cn.number || !cn.snapshot)
    throw new InvariantError("Issue the credit note before sending it.");
  if (cn.status === "VOID")
    throw new InvariantError("This credit note is void and cannot be sent.");
  const profile = await prisma.issuerProfile.findUniqueOrThrow({
    where: { id: cn.issuerProfileId },
  });
  return {
    number: cn.number,
    vars: {
      number: cn.number,
      issuerName: cn.snapshot.issuer.legalName,
      clientName: cn.snapshot.client.displayName,
      contactPerson: cn.snapshot.client.contactPerson ?? cn.snapshot.client.displayName,
      issueDate: formatDate(cn.issueDate, cn.locale),
      dueDate: "",
      total: formatMoney(cn.total, cn.currency, cn.locale),
      balanceDue: formatMoney(cn.invoice.balanceDue, cn.currency, cn.locale),
      currency: cn.currency,
      paymentTerms: `${cn.snapshot.client.paymentTermsDays} days`,
      verifyUrl: verify(cn.verificationToken),
    },
    clientEmail: cn.snapshot.client.email ?? null,
    profile: {
      id: profile.id,
      emailCc: profile.emailCc,
      emailBcc: profile.emailBcc,
      subjectTemplate: profile.emailCreditNoteSubject,
      bodyTemplate: profile.emailCreditNoteBody,
    },
    sentAt: cn.sentAt,
    backHref: `/credit-notes/${id}`,
  };
}

const uniq = (xs: string[]) => [...new Set(xs.map((x) => x.trim().toLowerCase()).filter(Boolean))];

/** Pre-fills the composer from the issuer's templates and defaults (SPEC §4.16). */
export async function composerDefaults(
  actor: Actor,
  kind: DocumentKind,
  id: string,
): Promise<ComposerDefaults> {
  const [ctx, smtp, defaults] = await Promise.all([
    documentContext(actor, kind, id),
    resolveSmtp(),
    getEmailDefaults(),
  ]);
  const subjectTemplate =
    ctx.profile.subjectTemplate ??
    (kind === "INVOICE" ? DEFAULT_TEMPLATES.invoiceSubject : DEFAULT_TEMPLATES.creditNoteSubject);
  const bodyTemplate =
    ctx.profile.bodyTemplate ??
    (kind === "INVOICE" ? DEFAULT_TEMPLATES.invoiceBody : DEFAULT_TEMPLATES.creditNoteBody);
  const subject = renderTemplate(subjectTemplate, ctx.vars);
  const body = renderTemplate(bodyTemplate, ctx.vars);
  const to = ctx.clientEmail ? [ctx.clientEmail] : [];
  const cc = uniq([...defaults.cc, ...safeList(ctx.profile.emailCc)]);
  const bcc = uniq([...defaults.bcc, ...safeList(ctx.profile.emailBcc)]);
  return {
    kind,
    id,
    number: ctx.number,
    to,
    cc,
    bcc,
    subject,
    body,
    attachmentName: `${ctx.number.replace(/[^A-Za-z0-9._-]+/g, "-")}.pdf`,
    smtpAvailable: smtp !== null,
    smtpSource: smtp?.source ?? null,
    mailto: buildMailto({ to, cc, bcc, subject, body }),
    sentAt: ctx.sentAt,
    backHref: ctx.backHref,
  };
}

function safeList(raw: string | null): string[] {
  try {
    return parseEmailList(raw);
  } catch {
    return [];
  }
}

/** Nothing is sent without this explicit call from the composer; every attempt is logged. */
export async function sendDocumentEmail(
  actor: Actor,
  input: SendEmailInput & { kind: DocumentKind; id: string },
): Promise<EmailMessageDto> {
  const decision = await rateLimiter.hit(
    `email:${actor.userId}`,
    LIMITS.email.limit,
    LIMITS.email.windowMs,
  );
  if (!decision.allowed) {
    throw new InvariantError(
      `Sending limit reached; try again in ${Math.ceil(decision.retryAfterMs / 60_000)} minutes.`,
    );
  }
  // The document's own rules (issued, not void) come before any transport question.
  const ctx = await documentContext(actor, input.kind, input.id);
  const smtp = await resolveSmtp();
  if (!smtp) throw new InvariantError("SMTP is not configured; use “Open in mail app” instead.");
  const doc = await ensureDocument(input.kind, input.id);
  const { stream } = await getDocumentStream(actor, doc.id);
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(Buffer.from(c as Uint8Array));
  const pdf = Buffer.concat(chunks);

  let status: "SENT" | "FAILED" = "SENT";
  let providerMessageId: string | null = null;
  let error: string | null = null;
  try {
    const result = await sendMail(smtp, {
      to: input.to,
      cc: input.cc,
      bcc: input.bcc,
      subject: input.subject,
      text: input.body,
      html: textToHtml(input.body),
      attachments: [{ filename: doc.filename, content: pdf, contentType: "application/pdf" }],
    });
    providerMessageId = result.messageId;
  } catch (e) {
    status = "FAILED";
    error = (e as Error).message.slice(0, 1000);
  }
  const row = await prisma.$transaction(async (tx) => {
    const created = await tx.emailMessage.create({
      data: {
        kind: input.kind,
        ...(input.kind === "INVOICE" ? { invoiceId: input.id } : { creditNoteId: input.id }),
        documentId: doc.id,
        to: input.to,
        cc: input.cc,
        bcc: input.bcc,
        subject: input.subject,
        bodyText: input.body,
        status,
        providerMessageId,
        error,
        sentById: actor.userId,
      },
      include: { invoice: { select: { number: true } }, creditNote: { select: { number: true } } },
    });
    if (status === "SENT") {
      if (input.kind === "INVOICE") await setSentAtIfUnset(tx, input.id);
      else await setCreditNoteSentAtIfUnset(tx, input.id);
    }
    await audit(
      tx,
      actor,
      status === "SENT" ? "email.sent" : "email.failed",
      "EmailMessage",
      created.id,
      {
        summary: `${status === "SENT" ? "Sent" : "Failed to send"} ${ctx.number} to ${input.to.join(", ")}`,
        after: {
          to: input.to,
          cc: input.cc,
          subject: input.subject,
          status,
          error,
          documentId: doc.id,
          [input.kind === "INVOICE" ? "invoiceId" : "creditNoteId"]: input.id,
        },
      },
    );
    return created;
  });
  return toDto(row);
}

/** The mail-app flow: records that the owner sent it by hand (SPEC §4.16 "Without SMTP"). */
export async function markSentManually(
  actor: Actor,
  kind: DocumentKind,
  id: string,
): Promise<EmailMessageDto> {
  const ctx = await documentContext(actor, kind, id);
  const defaults = await composerDefaults(actor, kind, id);
  const row = await prisma.$transaction(async (tx) => {
    const created = await tx.emailMessage.create({
      data: {
        kind,
        ...(kind === "INVOICE" ? { invoiceId: id } : { creditNoteId: id }),
        to: defaults.to,
        cc: [],
        bcc: [],
        subject: defaults.subject,
        bodyText: "(sent from the owner's mail app)",
        status: "MANUAL",
        sentById: actor.userId,
      },
      include: { invoice: { select: { number: true } }, creditNote: { select: { number: true } } },
    });
    if (kind === "INVOICE") await setSentAtIfUnset(tx, id);
    else await setCreditNoteSentAtIfUnset(tx, id);
    await audit(tx, actor, "email.manual", "EmailMessage", created.id, {
      summary: `Marked ${ctx.number} as sent manually`,
      after: { [kind === "INVOICE" ? "invoiceId" : "creditNoteId"]: id },
    });
    return created;
  });
  return toDto(row);
}

export async function listEmailMessages(
  _actor: Actor,
  o: { kind?: DocumentKind; id?: string; limit?: number } = {},
): Promise<EmailMessageDto[]> {
  const rows = await prisma.emailMessage.findMany({
    where: o.id ? (o.kind === "CREDIT_NOTE" ? { creditNoteId: o.id } : { invoiceId: o.id }) : {},
    include: { invoice: { select: { number: true } }, creditNote: { select: { number: true } } },
    orderBy: { createdAt: "desc" },
    take: o.limit ?? 50,
  });
  return rows.map(toDto);
}
