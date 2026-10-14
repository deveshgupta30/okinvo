import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ConfirmAction } from "@/components/confirm-action";
import { ScaledPreview } from "@/components/documents/scaled-preview";
import { ShareDialog } from "@/components/documents/share-dialog";
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
import { euProfileFor } from "@/server/dal/einvoice-settings";
import { assetUrl, verificationQr } from "@/server/dal/documents";
import { NotFoundError } from "@/server/dal/errors";
import { listShareLinks } from "@/server/dal/share-links";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("creditNotes.detail");
  return { title: t("metaTitle") };
}

const PT_TO_PX = 96 / 72;

export default async function CreditNotePage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireRole("VIEWER");
  const canEdit = hasRole(actor, "EDITOR");
  const t = await getTranslations("creditNotes.detail");
  const tn = await getTranslations("shell.nav");
  const tc = await getTranslations("common");
  const { id } = await params;
  const cn = await getCreditNote(actor, id).catch((e: unknown) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const money = (v: string) => formatMoney(v, cn.currency, cn.locale);
  const isDraft = cn.status === "DRAFT";
  const latestDoc = cn.documents[cn.documents.length - 1] ?? null;
  const euProfile = !isDraft && (await euProfileFor(cn.issuerProfileId)) === "EN16931";

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
            {cn.number ? <Mono className="text-app-title">{cn.number}</Mono> : t("draftTitle")}
            <StatusPill status={cn.displayStatus} />
          </>
        }
        breadcrumb={[{ href: "/credit-notes", label: tn("creditNotes") }]}
        meta={
          <span>
            {t.rich("meta", {
              client: cn.clientName,
              number: cn.invoiceNumber ?? "",
              date: formatDate(cn.issueDate, cn.locale),
              invoice: (chunks) => (
                <Link href={`/invoices/${cn.invoiceId}`} className="text-link">
                  {chunks}
                </Link>
              ),
              mono: (chunks) => <Mono>{chunks}</Mono>,
            })}
          </span>
        }
        actions={
          <>
            {isDraft && canEdit ? (
              <>
                <Button asChild variant="secondary">
                  <Link href={`/credit-notes/${id}/edit`}>{tc("edit")}</Link>
                </Button>
                <Button asChild variant="tertiary">
                  <a
                    href={`/api/documents/preview?creditNote=${id}`}
                    target="_blank"
                    rel="noopener"
                  >
                    {t("previewPdf")}
                  </a>
                </Button>
                <ConfirmAction
                  action={issueCreditNoteAction}
                  title={t("issue.title")}
                  description={t("issue.description")}
                  confirmLabel={t("issue.label")}
                  hidden={{ id }}
                  trigger={t("issue.label")}
                  triggerVariant="primary"
                />
                <ConfirmAction
                  action={deleteCreditNoteDraftAction}
                  title={t("deleteDraft.title")}
                  confirmLabel={tc("delete")}
                  hidden={{ id }}
                  trigger={tc("delete")}
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
                    {tc("downloadPdf")}
                  </a>
                </Button>
                <Button asChild variant="secondary">
                  <a href={`/api/documents/preview?creditNote=${id}&format=docx`}>
                    {tc("downloadDocx")}
                  </a>
                </Button>
                {euProfile ? (
                  <>
                    <Button asChild variant="secondary">
                      <a href={`/api/documents/einvoice/${id}?format=cii&kind=creditNote`}>
                        {tc("downloadCii")}
                      </a>
                    </Button>
                    <Button asChild variant="secondary">
                      <a href={`/api/documents/einvoice/${id}?format=ubl&kind=creditNote`}>
                        {tc("downloadUbl")}
                      </a>
                    </Button>
                    <Button asChild variant="secondary">
                      <a href={`/api/documents/preview?creditNote=${id}&format=facturx`}>
                        {tc("downloadFacturX")}
                      </a>
                    </Button>
                  </>
                ) : null}
                {cn.status === "ISSUED" && canEdit ? (
                  <>
                    <ShareDialog
                      kind="CREDIT_NOTE"
                      id={id}
                      links={await listShareLinks(actor, "CREDIT_NOTE", id)}
                    />
                    <Button asChild variant="secondary">
                      <Link href={`/credit-notes/${id}/send`}>{t("sendByEmail")}</Link>
                    </Button>
                    {!cn.sentAt ? (
                      <ConfirmAction
                        action={markCreditNoteSentAction}
                        title={t("markSent.title")}
                        confirmLabel={t("markSent.label")}
                        hidden={{ id }}
                        trigger={t("markSent.label")}
                        triggerVariant="tertiary"
                      />
                    ) : null}
                    <ConfirmAction
                      action={voidCreditNoteAction}
                      title={t("void.title")}
                      description={t("void.description")}
                      confirmLabel={t("void.label")}
                      hidden={{ id }}
                      reason={{ label: t("void.reason"), required: true }}
                      trigger={t("void.label")}
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
          {t("voided", {
            date: cn.voidedAt
              ? formatDateTime(new Date(cn.voidedAt), actor.locale, actor.timezone)
              : "",
            reason: cn.voidReason ?? "",
          })}
        </p>
      ) : null}
      <div className="grid gap-6 xl:grid-cols-[7fr_5fr]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("amounts.title")}</CardTitle>
            </CardHeader>
            <CardContent>
              <DescriptionList>
                <Item label={t("amounts.reason")}>{cn.reason}</Item>
                <Item label={t("amounts.creditAmount")}>
                  <Amount>{money(cn.subtotal)}</Amount>
                </Item>
                {cn.taxLines.map((line) => (
                  <Item
                    key={`${line.taxType}-${line.rate}`}
                    label={`${line.taxType} ${formatPercent(line.rate)}`}
                  >
                    <Amount>{money(line.taxAmount)}</Amount>
                  </Item>
                ))}
                <Item label={t("amounts.total")}>
                  <Amount className="text-app-section">{money(cn.total)}</Amount>
                </Item>
                <Item label={t("amounts.balanceNow")}>
                  <Amount>{money(cn.invoice.balanceDue)}</Amount>
                </Item>
                {cn.sentAt ? (
                  <Item label={t("amounts.sent")} mono>
                    {formatDateTime(new Date(cn.sentAt), actor.locale, actor.timezone)}
                  </Item>
                ) : null}
              </DescriptionList>
            </CardContent>
          </Card>
          {!isDraft ? (
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>{t("documents.title")}</CardTitle>
                  <CardDescription>{t("documents.description")}</CardDescription>
                </div>
                <ConfirmAction
                  action={regenerateCreditNoteDocumentAction}
                  title={t("documents.regenerateTitle")}
                  confirmLabel={t("documents.generate")}
                  hidden={{ id }}
                  trigger={t("documents.newVersion")}
                  triggerVariant="tertiary"
                  size="sm"
                />
              </CardHeader>
              <CardContent>
                {cn.documents.length === 0 ? (
                  <p className="text-app-body text-ink-subtle">
                    {t("documents.renderedOnFirstDownload")}
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
                              ? t("documents.protectedCopy", { version: d.version })
                              : t("documents.version", { version: d.version })}
                          </a>
                          <span className="text-ink-subtle">
                            {" "}
                            ·{" "}
                            {formatDateTime(new Date(d.generatedAt), actor.locale, actor.timezone)}
                          </span>
                        </span>
                        <Mono className="break-all text-ink-subtle">{d.sha256}</Mono>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="text-app-caption text-ink-subtle">
                  {t.rich("documents.verificationLink", {
                    path: `/verify/${cn.verificationToken.slice(0, 8)}`,
                    link: (chunks) => (
                      <a
                        href={`/verify/${cn.verificationToken}`}
                        className="text-link"
                        target="_blank"
                        rel="noopener"
                      >
                        {chunks}
                      </a>
                    ),
                  })}
                </p>
              </CardContent>
            </Card>
          ) : null}
        </div>
        <aside className="min-w-0">
          {preview ?? (
            <Card>
              <CardContent>
                <p className="text-app-body text-ink-subtle">{t("draftsPreview")}</p>
              </CardContent>
            </Card>
          )}
        </aside>
      </div>
    </>
  );
}
