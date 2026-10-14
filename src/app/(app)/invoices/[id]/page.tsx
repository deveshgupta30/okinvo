import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ConfirmAction } from "@/components/confirm-action";
import { ScaledPreview } from "@/components/documents/scaled-preview";
import { ShareDialog } from "@/components/documents/share-dialog";
import { EInvoicePanel } from "@/components/invoices/einvoice-panel";
import { canCancel } from "@/lib/einvoice/gst/connector";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DescriptionList, Item } from "@/components/ui/description-list";
import { Amount, Mono } from "@/components/ui/mono";
import { PageHeader } from "@/components/ui/page-header";
import { Pill, StatusPill } from "@/components/ui/status-pill";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { DocumentPreview, PAPER, buildDocumentViewModel } from "@/lib/documents";
import { env } from "@/lib/env";
import { formatDate, formatDateTime, formatMoney, formatPercent } from "@/lib/format";
import { DEFAULT_TEMPLATE_CONFIG } from "@/lib/schemas";
import {
  deleteDraftAction,
  issueInvoiceAction,
  markSentAction,
  regenerateDocumentAction,
  voidAndReissueAction,
  voidInvoiceAction,
} from "@/server/actions/invoices";
import { requireRole } from "@/server/auth";
import { hasRole } from "@/server/dal/authz";
import { assetUrl, renderInputFromInvoice, verificationQr } from "@/server/dal/documents";
import { einvoiceConnectorFor } from "@/server/dal/einvoice-settings";
import { NotFoundError } from "@/server/dal/errors";
import { getInvoice } from "@/server/dal/invoices";
import { listShareLinks } from "@/server/dal/share-links";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("invoices.detail");
  return { title: t("metaTitle") };
}

const PT_TO_PX = 96 / 72;

/** Document lifecycle status → its `invoices.shared.lifecycle` catalogue key. */
const LIFECYCLE_KEY = { DRAFT: "draft", ISSUED: "issued", VOID: "void" } as const;

/** Place-of-supply classification → its `invoices.shared.supplyTypes` catalogue key. */
const SUPPLY_KEY = {
  INTRA_STATE: "intraState",
  INTER_STATE: "interState",
  EXPORT_LUT: "exportLut",
  EXPORT_WITH_TAX: "exportWithTax",
  REVERSE_CHARGE: "reverseCharge",
  NOT_APPLICABLE: "notApplicable",
} as const;

/** Unit type → its `invoices.shared.unitsLower` catalogue key. */
const UNIT_KEY = {
  HOUR: "hour",
  DAY: "day",
  FIXED: "fixed",
  MILESTONE: "milestone",
  UNIT: "unit",
} as const;

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireRole("VIEWER");
  const canEdit = hasRole(actor, "EDITOR");
  const { id } = await params;
  const inv = await getInvoice(actor, id).catch((e: unknown) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const money = (v: string) => formatMoney(v, inv.currency, inv.locale);
  const isDraft = inv.status === "DRAFT";
  const isIssued = inv.status === "ISSUED";
  const latestDoc = inv.documents[inv.documents.length - 1] ?? null;
  const shareLinks = !isDraft && canEdit ? await listShareLinks(actor, "INVOICE", id) : [];
  const showEInvoice = isIssued && inv.taxRegime === "INDIA_GST" && inv.issuer.einvoiceEnabled;
  const einvoiceConnector = showEInvoice ? await einvoiceConnectorFor(inv.issuerProfileId) : null;
  const einvoiceState = inv.einvoice ?? { status: "NONE" as const };
  const t = await getTranslations("invoices.detail");
  const ts = await getTranslations("invoices.shared");
  const tc = await getTranslations("common");

  let preview: React.ReactNode = null;
  if (!isDraft && inv.issuerSnapshot && inv.clientSnapshot) {
    const config = inv.templateSnapshot ?? DEFAULT_TEMPLATE_CONFIG;
    const input = renderInputFromInvoice(inv);
    const verifyUrl = `${env.APP_URL.replace(/\/$/, "")}/verify/${inv.verificationToken}`;
    const signedQr =
      inv.einvoice?.status === "REGISTERED" || inv.einvoice?.status === "CANCELLED"
        ? inv.einvoice.signedQr
        : undefined;
    const qr =
      signedQr || inv.displayConfig.document.showQrVerification
        ? await verificationQr(signedQr ?? verifyUrl)
        : undefined;
    const vm = buildDocumentViewModel(input, {
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
            {inv.number ? <Mono className="text-app-title">{inv.number}</Mono> : t("draftInvoice")}
            <StatusPill status={inv.displayStatus} />
          </>
        }
        breadcrumb={[{ href: "/invoices", label: ts("invoices") }]}
        meta={
          <span className="flex flex-wrap gap-x-4 gap-y-1">
            <span>
              {inv.clientName} · {inv.issuerLabel}
            </span>
            <span>
              {t.rich("issuedDue", {
                issued: formatDate(inv.issueDate, inv.locale),
                due: formatDate(inv.dueDate, inv.locale),
                mono: (chunks) => <Mono>{chunks}</Mono>,
              })}
            </span>
            {inv.replaces ? (
              <Link href={`/invoices/${inv.replaces.id}`} className="text-link">
                {t("replaces", { number: inv.replaces.number ?? "" })}
              </Link>
            ) : null}
            {inv.replacedBy ? (
              <Link href={`/invoices/${inv.replacedBy.id}`} className="text-link">
                {t("replacedBy", { number: inv.replacedBy.number ?? ts("aDraft") })}
              </Link>
            ) : null}
          </span>
        }
        actions={
          <>
            {isDraft && canEdit ? (
              <>
                <Button asChild variant="secondary">
                  <Link href={`/invoices/${id}/edit`}>{tc("edit")}</Link>
                </Button>
                <Button asChild variant="tertiary">
                  <a href={`/api/documents/preview?invoice=${id}`} target="_blank" rel="noopener">
                    {t("previewPdf")}
                  </a>
                </Button>
                <ConfirmAction
                  action={issueInvoiceAction}
                  title={t("issueTitle")}
                  description={t("issueDescription")}
                  confirmLabel={t("issue")}
                  hidden={{ id }}
                  trigger={t("issue")}
                  triggerVariant="primary"
                />
                <ConfirmAction
                  action={deleteDraftAction}
                  title={t("deleteDraftTitle")}
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
                        : `/api/documents/preview?invoice=${id}`
                    }
                  >
                    {tc("downloadPdf")}
                  </a>
                </Button>
                <Button asChild variant="secondary">
                  <a href={`/api/documents/preview?invoice=${id}&format=docx`}>
                    {tc("downloadDocx")}
                  </a>
                </Button>
                {inv.taxRegime === "INDIA_GST" && inv.issuer.einvoiceEnabled && inv.issuer.gstin ? (
                  <Button asChild variant="secondary">
                    <a href={`/api/documents/einvoice/${id}?format=gst`}>{t("downloadEInvoice")}</a>
                  </Button>
                ) : null}
                {isIssued && canEdit ? (
                  <>
                    <ShareDialog kind="INVOICE" id={id} links={shareLinks} />
                    <Button asChild variant="secondary">
                      <Link href={`/invoices/${id}/send`}>{t("sendByEmail")}</Link>
                    </Button>
                    <Button asChild variant="secondary">
                      <Link href={`/invoices/${id}/payments`}>{t("recordPayment")}</Link>
                    </Button>
                    <Button asChild variant="tertiary">
                      <Link href={`/credit-notes/new?invoice=${id}`}>{t("creditNote")}</Link>
                    </Button>
                    {!inv.sentAt ? (
                      <ConfirmAction
                        action={markSentAction}
                        title={t("markSentTitle")}
                        description={t("markSentDescription")}
                        confirmLabel={t("markSent")}
                        hidden={{ id }}
                        trigger={t("markSent")}
                        triggerVariant="tertiary"
                      />
                    ) : null}
                    <ConfirmAction
                      action={voidAndReissueAction}
                      title={t("voidReissueTitle")}
                      description={t("voidReissueDescription")}
                      confirmLabel={t("voidReissue")}
                      hidden={{ id }}
                      reason={{ label: tc("reason"), required: true }}
                      trigger={t("voidReissue")}
                      triggerVariant="tertiary"
                      destructive
                    />
                    <ConfirmAction
                      action={voidInvoiceAction}
                      title={t("voidTitle")}
                      description={t("voidDescription")}
                      confirmLabel={t("void")}
                      hidden={{ id }}
                      reason={{ label: tc("reason"), required: true }}
                      trigger={t("void")}
                      triggerVariant="tertiary"
                      destructive
                    />
                  </>
                ) : null}
                <Button asChild variant="tertiary">
                  <Link href={`/invoices/${id}/history`}>{tc("history")}</Link>
                </Button>
              </>
            )}
          </>
        }
      />

      {inv.status === "VOID" ? (
        <p className="mb-6 rounded-md border border-semantic-danger/40 bg-surface-2 px-4 py-3 text-app-body text-semantic-danger">
          {t("voided", {
            date: inv.voidedAt
              ? formatDateTime(new Date(inv.voidedAt), actor.locale, actor.timezone)
              : "",
            reason: inv.voidReason ?? "",
          })}
        </p>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[7fr_5fr]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("amounts")}</CardTitle>
            </CardHeader>
            <CardContent>
              <DescriptionList>
                <Item label={t("subtotal")}>
                  <Amount>{money(inv.subtotal)}</Amount>
                </Item>
                {inv.discountAmount !== "0.00" && inv.discountAmount !== "0" ? (
                  <Item
                    label={
                      inv.discountType === "PERCENT" && inv.discountValue
                        ? t("discountPercent", { percent: formatPercent(inv.discountValue) })
                        : t("discount")
                    }
                  >
                    <Amount>−{money(inv.discountAmount)}</Amount>
                  </Item>
                ) : null}
                {inv.taxLines.map((line) => (
                  <Item
                    key={`${line.taxType}-${line.rate}`}
                    label={`${line.taxType} ${formatPercent(line.rate)}`}
                  >
                    <Amount>{money(line.taxAmount)}</Amount>
                  </Item>
                ))}
                {inv.roundingAdjustment !== "0.00" && inv.roundingAdjustment !== "0" ? (
                  <Item label={t("rounding")}>
                    <Amount>{money(inv.roundingAdjustment)}</Amount>
                  </Item>
                ) : null}
                <Item label={tc("total")}>
                  <Amount className="text-app-section">{money(inv.total)}</Amount>
                </Item>
                {inv.tdsRate !== "0" ? (
                  <Item label={t("tdsExpected", { percent: formatPercent(inv.tdsRate) })}>
                    <Amount>{money(inv.tdsExpected)}</Amount>
                  </Item>
                ) : null}
                {!isDraft ? (
                  <>
                    <Item label={t("paid")}>
                      <Amount>{money(inv.amountPaid)}</Amount>
                    </Item>
                    <Item label={t("credited")}>
                      <Amount>{money(inv.amountCredited)}</Amount>
                    </Item>
                    <Item label={t("balanceDue")}>
                      <Amount className="text-app-section">{money(inv.balanceDue)}</Amount>
                    </Item>
                  </>
                ) : null}
                <Item label={t("supply")}>
                  {ts(`supplyTypes.${SUPPLY_KEY[inv.supplyType]}`)}
                  {inv.placeOfSupply ? ` · ${inv.placeOfSupply}` : ""}
                </Item>
                {inv.fxRateToBase !== "1" ? (
                  <Item label={t("fxToBase")} mono>
                    {inv.fxRateToBase}
                  </Item>
                ) : null}
                {inv.poReference ? <Item label={t("poReference")}>{inv.poReference}</Item> : null}
                {inv.sentAt ? (
                  <Item label={t("sent")} mono>
                    {formatDateTime(new Date(inv.sentAt), actor.locale, actor.timezone)}
                  </Item>
                ) : null}
              </DescriptionList>
            </CardContent>
          </Card>

          {showEInvoice ? (
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>{t("einvoice.title")}</CardTitle>
                  <CardDescription>{t("einvoice.description")}</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                <EInvoicePanel
                  invoiceId={id}
                  state={einvoiceState}
                  connector={einvoiceConnector}
                  canEdit={canEdit}
                  cancellable={canCancel(einvoiceState)}
                  ackDateLabel={
                    einvoiceState.ackDate
                      ? formatDateTime(
                          new Date(einvoiceState.ackDate),
                          actor.locale,
                          actor.timezone,
                        )
                      : null
                  }
                />
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>{t("lineItems")}</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <THead>
                  <TR>
                    <TH>#</TH>
                    <TH>{t("columns.description")}</TH>
                    <TH>{t("columns.sacHsn")}</TH>
                    <TH numeric>{t("columns.qty")}</TH>
                    <TH numeric>{t("columns.rate")}</TH>
                    <TH numeric>{t("columns.tax")}</TH>
                    <TH numeric>{t("columns.amount")}</TH>
                  </TR>
                </THead>
                <TBody>
                  {inv.items.map((it) => (
                    <TR key={it.id}>
                      <TD className="text-ink-subtle">{it.position}</TD>
                      <TD className="whitespace-pre-wrap">{it.description}</TD>
                      <TD mono>{it.sacHsnCode ?? tc("emptyValue")}</TD>
                      <TD numeric>
                        {it.quantity.replace(/\.?0+$/, "")}{" "}
                        {ts(`unitsLower.${UNIT_KEY[it.unitType]}`)}
                      </TD>
                      <TD numeric>
                        <Amount>{money(it.unitPrice)}</Amount>
                      </TD>
                      <TD numeric>
                        <Amount>{money(it.taxAmount)}</Amount>{" "}
                        <span className="text-ink-subtle">({formatPercent(it.taxRate)})</span>
                      </TD>
                      <TD numeric>
                        <Amount>{money(it.lineSubtotal)}</Amount>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </CardContent>
          </Card>

          {inv.creditNotes.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>{t("creditNotes")}</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="flex flex-col gap-2 text-app-body">
                  {inv.creditNotes.map((cn) => (
                    <li key={cn.id} className="flex items-center justify-between">
                      <Link href={`/credit-notes/${cn.id}`} className="text-link">
                        <Mono>{cn.number ?? ts("draft")}</Mono>
                      </Link>
                      <span className="flex items-center gap-3">
                        <Pill>{ts(`lifecycle.${LIFECYCLE_KEY[cn.status]}`)}</Pill>
                        <Amount>{money(cn.total)}</Amount>
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}

          {!isDraft ? (
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>{t("storedDocuments")}</CardTitle>
                  <CardDescription>{t("storedDocumentsHint")}</CardDescription>
                </div>
                <ConfirmAction
                  action={regenerateDocumentAction}
                  title={t("regenerateTitle")}
                  description={t("regenerateDescription")}
                  confirmLabel={t("regenerate")}
                  hidden={{ id }}
                  trigger={t("newVersion")}
                  triggerVariant="tertiary"
                  size="sm"
                />
              </CardHeader>
              <CardContent>
                {inv.documents.length === 0 ? (
                  <p className="text-app-body text-ink-subtle">{t("renderedOnFirstDownload")}</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {inv.documents.map((d) => (
                      <li
                        key={d.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-surface-2 px-3 py-2 text-app-caption"
                      >
                        <span>
                          <a href={`/api/documents/${d.id}`} className="text-link">
                            {d.format === "PDF_PROTECTED"
                              ? t("protectedCopy", { version: String(d.version) })
                              : t("version", { version: String(d.version) })}
                          </a>
                          <span className="text-ink-subtle">
                            {" "}
                            ·{" "}
                            {formatDateTime(
                              new Date(d.generatedAt),
                              actor.locale,
                              actor.timezone,
                            )}{" "}
                            · {t("sizeKb", { size: String(Math.round(d.byteSize / 1024)) })}
                          </span>
                        </span>
                        <Mono className="break-all text-ink-subtle">{d.sha256}</Mono>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="text-app-caption text-ink-subtle">
                  {t("verificationLink")}{" "}
                  <a
                    href={`/verify/${inv.verificationToken}`}
                    className="text-link"
                    target="_blank"
                    rel="noopener"
                  >
                    /verify/{inv.verificationToken.slice(0, 8)}…
                  </a>
                </p>
              </CardContent>
            </Card>
          ) : null}
        </div>

        <aside className="flex min-w-0 flex-col gap-4">
          {preview ?? (
            <Card>
              <CardContent>
                <p className="text-app-body text-ink-subtle">
                  {t.rich("draftPreviewHint", {
                    link: (chunks) => (
                      <a
                        className="text-link"
                        href={`/api/documents/preview?invoice=${id}`}
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
          )}
        </aside>
      </div>
    </>
  );
}
