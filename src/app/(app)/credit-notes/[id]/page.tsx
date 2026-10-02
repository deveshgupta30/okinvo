import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ConfirmAction } from "@/components/confirm-action";
import { ScaledPreview } from "@/components/documents/scaled-preview";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DescriptionList, Item } from "@/components/ui/description-list";
import { Amount, Mono } from "@/components/ui/mono";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { creditNoteRenderInputFromSnapshot } from "@/lib/credit-notes/preview";
import { DocumentPreview, PAPER, buildDocumentViewModel } from "@/lib/documents";
import { env } from "@/lib/env";
import { formatDate, formatDateTime, formatMoney, formatPercent } from "@/lib/format";
import { DEFAULT_TEMPLATE_CONFIG } from "@/lib/schemas";
import {
  deleteCreditNoteDraftAction,
  issueCreditNoteAction,
  markCreditNoteSentAction,
  regenerateCreditNoteDocumentAction,
  voidCreditNoteAction,
} from "@/server/actions/credit-notes";
import { requireRole } from "@/server/auth";
import { hasRole } from "@/server/dal/authz";
import { getCreditNote } from "@/server/dal/credit-notes";
import { assetUrl, verificationQr } from "@/server/dal/documents";
import { NotFoundError } from "@/server/dal/errors";

export const metadata: Metadata = { title: "Credit note" };

const PT_TO_PX = 96 / 72;

export default async function CreditNotePage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireRole("VIEWER");
  const canEdit = hasRole(actor, "EDITOR");
  const { id } = await params;
  const cn = await getCreditNote(actor, id).catch((e: unknown) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const money = (v: string) => formatMoney(v, cn.currency, cn.locale);
  const isDraft = cn.status === "DRAFT";
  const latestDoc = cn.documents[cn.documents.length - 1] ?? null;

  let preview: React.ReactNode = null;
  if (!isDraft && cn.snapshot) {
    const config = cn.templateSnapshot ?? DEFAULT_TEMPLATE_CONFIG;
    const verifyUrl = `${env.APP_URL.replace(/\/$/, "")}/verify/${cn.verificationToken}`;
    const qr = cn.displayConfig.document.showQrVerification
      ? await verificationQr(verifyUrl)
      : undefined;
    const vm = buildDocumentViewModel(creditNoteRenderInputFromSnapshot(cn), {
      appUrl: env.APP_URL,
      assetUrl,
      config,
      draft: false,
      ...(qr ? { qrDataUrl: qr } : {}),
    });
    const paper = PAPER[config.paper.size];
    preview = (
      <ScaledPreview pageWidthPx={paper.width * PT_TO_PX} pageHeightPx={paper.height * PT_TO_PX}>
        <DocumentPreview vm={vm} config={config} />
      </ScaledPreview>
    );
  }

  return (
    <>
      <PageHeader
        title={
          <>
            {cn.number ? <Mono className="text-app-title">{cn.number}</Mono> : "Draft credit note"}
            <StatusPill status={cn.displayStatus} />
          </>
        }
        breadcrumb={[{ href: "/credit-notes", label: "Credit notes" }]}
        meta={
          <span>
            {cn.clientName} · against{" "}
            <Link href={`/invoices/${cn.invoiceId}`} className="text-link">
              {cn.invoiceNumber}
            </Link>{" "}
            · issued <Mono>{formatDate(cn.issueDate, cn.locale)}</Mono>
          </span>
        }
        actions={
          <>
            {isDraft && canEdit ? (
              <>
                <Button asChild variant="secondary">
                  <Link href={`/credit-notes/${id}/edit`}>Edit</Link>
                </Button>
                <Button asChild variant="tertiary">
                  <a
                    href={`/api/documents/preview?creditNote=${id}`}
                    target="_blank"
                    rel="noopener"
                  >
                    Preview PDF
                  </a>
                </Button>
                <ConfirmAction
                  action={issueCreditNoteAction}
                  title="Issue this credit note?"
                  description="A number is allocated, the invoice balance is reduced and the document becomes immutable."
                  confirmLabel="Issue"
                  hidden={{ id }}
                  trigger="Issue"
                  triggerVariant="primary"
                />
                <ConfirmAction
                  action={deleteCreditNoteDraftAction}
                  title="Delete this draft?"
                  confirmLabel="Delete"
                  hidden={{ id }}
                  trigger="Delete"
                  triggerVariant="tertiary"
                  destructive
                />
              </>
            ) : (
              <>
                <Button asChild variant="secondary">
                  <a
                    href={
                      latestDoc
                        ? `/api/documents/${latestDoc.id}`
                        : `/api/documents/preview?creditNote=${id}`
                    }
                  >
                    Download PDF
                  </a>
                </Button>
                {cn.status === "ISSUED" && canEdit ? (
                  <>
                    <Button asChild variant="secondary">
                      <Link href={`/credit-notes/${id}/send`}>Send by email</Link>
                    </Button>
                    {!cn.sentAt ? (
                      <ConfirmAction
                        action={markCreditNoteSentAction}
                        title="Mark as sent?"
                        confirmLabel="Mark as sent"
                        hidden={{ id }}
                        trigger="Mark as sent"
                        triggerVariant="tertiary"
                      />
                    ) : null}
                    <ConfirmAction
                      action={voidCreditNoteAction}
                      title="Void this credit note?"
                      description="The invoice balance is restored; the number is never reused."
                      confirmLabel="Void"
                      hidden={{ id }}
                      reason={{ label: "Reason", required: true }}
                      trigger="Void"
                      triggerVariant="tertiary"
                      destructive
                    />
                  </>
                ) : null}
              </>
            )}
          </>
        }
      />
      {cn.status === "VOID" ? (
        <p className="mb-6 rounded-md border border-semantic-danger/40 bg-surface-2 px-4 py-3 text-app-body text-semantic-danger">
          Voided {cn.voidedAt ? formatDateTime(new Date(cn.voidedAt), "en-GB", actor.timezone) : ""}
          : {cn.voidReason}
        </p>
      ) : null}
      <div className="grid gap-6 xl:grid-cols-[7fr_5fr]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Amounts</CardTitle>
            </CardHeader>
            <CardContent>
              <DescriptionList>
                <Item label="Reason">{cn.reason}</Item>
                <Item label="Credit amount">
                  <Amount>{money(cn.subtotal)}</Amount>
                </Item>
                {cn.taxLines.map((t) => (
                  <Item
                    key={`${t.taxType}-${t.rate}`}
                    label={`${t.taxType} ${formatPercent(t.rate)}`}
                  >
                    <Amount>{money(t.taxAmount)}</Amount>
                  </Item>
                ))}
                <Item label="Total">
                  <Amount className="text-app-section">{money(cn.total)}</Amount>
                </Item>
                <Item label="Invoice balance now">
                  <Amount>{money(cn.invoice.balanceDue)}</Amount>
                </Item>
                {cn.sentAt ? (
                  <Item label="Sent" mono>
                    {formatDateTime(new Date(cn.sentAt), "en-GB", actor.timezone)}
                  </Item>
                ) : null}
              </DescriptionList>
            </CardContent>
          </Card>
          {!isDraft ? (
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Stored documents</CardTitle>
                  <CardDescription>
                    Every version is kept; the verify page lists all hashes.
                  </CardDescription>
                </div>
                <ConfirmAction
                  action={regenerateCreditNoteDocumentAction}
                  title="Generate a new PDF version?"
                  confirmLabel="Generate"
                  hidden={{ id }}
                  trigger="New version"
                  triggerVariant="tertiary"
                  size="sm"
                />
              </CardHeader>
              <CardContent>
                {cn.documents.length === 0 ? (
                  <p className="text-app-body text-ink-subtle">
                    The PDF is rendered on first download.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {cn.documents.map((d) => (
                      <li
                        key={d.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-surface-2 px-3 py-2 text-app-caption"
                      >
                        <span>
                          <a href={`/api/documents/${d.id}`} className="text-link">
                            {d.format === "PDF_PROTECTED"
                              ? `Password-protected copy ${d.version}`
                              : `Version ${d.version}`}
                          </a>
                          <span className="text-ink-subtle">
                            {" "}
                            · {formatDateTime(new Date(d.generatedAt), "en-GB", actor.timezone)}
                          </span>
                        </span>
                        <Mono className="break-all text-ink-subtle">{d.sha256}</Mono>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="text-app-caption text-ink-subtle">
                  Verification link:{" "}
                  <a
                    href={`/verify/${cn.verificationToken}`}
                    className="text-link"
                    target="_blank"
                    rel="noopener"
                  >
                    /verify/{cn.verificationToken.slice(0, 8)}…
                  </a>
                </p>
              </CardContent>
            </Card>
          ) : null}
        </div>
        <aside className="min-w-0">
          {preview ?? (
            <Card>
              <CardContent>
                <p className="text-app-body text-ink-subtle">Drafts preview live in the editor.</p>
              </CardContent>
            </Card>
          )}
        </aside>
      </div>
    </>
  );
}
