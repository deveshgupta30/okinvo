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
import { NotFoundError } from "@/server/dal/errors";
import { getInvoice } from "@/server/dal/invoices";

export const metadata: Metadata = { title: "Invoice" };

const PT_TO_PX = 96 / 72;

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

  let preview: React.ReactNode = null;
  if (!isDraft && inv.issuerSnapshot && inv.clientSnapshot) {
    const config = inv.templateSnapshot ?? DEFAULT_TEMPLATE_CONFIG;
    const input = renderInputFromInvoice(inv);
    const verifyUrl = `${env.APP_URL.replace(/\/$/, "")}/verify/${inv.verificationToken}`;
    const qr = inv.displayConfig.document.showQrVerification
      ? await verificationQr(verifyUrl)
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
            {inv.number ? <Mono className="text-app-title">{inv.number}</Mono> : "Draft invoice"}
            <StatusPill status={inv.displayStatus} />
          </>
        }
        breadcrumb={[{ href: "/invoices", label: "Invoices" }]}
        meta={
          <span className="flex flex-wrap gap-x-4 gap-y-1">
            <span>
              {inv.clientName} · {inv.issuerLabel}
            </span>
            <span>
              Issued <Mono>{formatDate(inv.issueDate, inv.locale)}</Mono>, due{" "}
              <Mono>{formatDate(inv.dueDate, inv.locale)}</Mono>
            </span>
            {inv.replaces ? (
              <Link href={`/invoices/${inv.replaces.id}`} className="text-link">
                Replaces {inv.replaces.number}
              </Link>
            ) : null}
            {inv.replacedBy ? (
              <Link href={`/invoices/${inv.replacedBy.id}`} className="text-link">
                Replaced by {inv.replacedBy.number ?? "a draft"}
              </Link>
            ) : null}
          </span>
        }
        actions={
          <>
            {isDraft && canEdit ? (
              <>
                <Button asChild variant="secondary">
                  <Link href={`/invoices/${id}/edit`}>Edit</Link>
                </Button>
                <Button asChild variant="tertiary">
                  <a href={`/api/documents/preview?invoice=${id}`} target="_blank" rel="noopener">
                    Preview PDF
                  </a>
                </Button>
                <ConfirmAction
                  action={issueInvoiceAction}
                  title="Issue this invoice?"
                  description="A number is allocated and the document becomes immutable."
                  confirmLabel="Issue"
                  hidden={{ id }}
                  trigger="Issue"
                  triggerVariant="primary"
                />
                <ConfirmAction
                  action={deleteDraftAction}
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
                        : `/api/documents/preview?invoice=${id}`
                    }
                  >
                    Download PDF
                  </a>
                </Button>
                {isIssued && canEdit ? (
                  <>
                    <Button asChild variant="secondary">
                      <Link href={`/invoices/${id}/send`}>Send by email</Link>
                    </Button>
                    <Button asChild variant="secondary">
                      <Link href={`/invoices/${id}/payments`}>Record payment</Link>
                    </Button>
                    <Button asChild variant="tertiary">
                      <Link href={`/credit-notes/new?invoice=${id}`}>Credit note</Link>
                    </Button>
                    {!inv.sentAt ? (
                      <ConfirmAction
                        action={markSentAction}
                        title="Mark as sent?"
                        description="Records that the client has received this invoice."
                        confirmLabel="Mark as sent"
                        hidden={{ id }}
                        trigger="Mark as sent"
                        triggerVariant="tertiary"
                      />
                    ) : null}
                    <ConfirmAction
                      action={voidAndReissueAction}
                      title="Void and reissue?"
                      description="The original is voided and a linked draft with the same content opens for editing."
                      confirmLabel="Void & reissue"
                      hidden={{ id }}
                      reason={{ label: "Reason", required: true }}
                      trigger="Void & reissue"
                      triggerVariant="tertiary"
                      destructive
                    />
                    <ConfirmAction
                      action={voidInvoiceAction}
                      title="Void this invoice?"
                      description="Only possible without recorded payments; the number is never reused."
                      confirmLabel="Void"
                      hidden={{ id }}
                      reason={{ label: "Reason", required: true }}
                      trigger="Void"
                      triggerVariant="tertiary"
                      destructive
                    />
                  </>
                ) : null}
                <Button asChild variant="tertiary">
                  <Link href={`/invoices/${id}/history`}>History</Link>
                </Button>
              </>
            )}
          </>
        }
      />

      {inv.status === "VOID" ? (
        <p className="mb-6 rounded-md border border-semantic-danger/40 bg-surface-2 px-4 py-3 text-app-body text-semantic-danger">
          Voided{" "}
          {inv.voidedAt ? formatDateTime(new Date(inv.voidedAt), "en-GB", actor.timezone) : ""}:{" "}
          {inv.voidReason}
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
                <Item label="Subtotal">
                  <Amount>{money(inv.subtotal)}</Amount>
                </Item>
                {inv.discountAmount !== "0.00" && inv.discountAmount !== "0" ? (
                  <Item
                    label={`Discount${inv.discountType === "PERCENT" && inv.discountValue ? ` (${formatPercent(inv.discountValue)})` : ""}`}
                  >
                    <Amount>−{money(inv.discountAmount)}</Amount>
                  </Item>
                ) : null}
                {inv.taxLines.map((t) => (
                  <Item
                    key={`${t.taxType}-${t.rate}`}
                    label={`${t.taxType} ${formatPercent(t.rate)}`}
                  >
                    <Amount>{money(t.taxAmount)}</Amount>
                  </Item>
                ))}
                {inv.roundingAdjustment !== "0.00" && inv.roundingAdjustment !== "0" ? (
                  <Item label="Rounding">
                    <Amount>{money(inv.roundingAdjustment)}</Amount>
                  </Item>
                ) : null}
                <Item label="Total">
                  <Amount className="text-app-section">{money(inv.total)}</Amount>
                </Item>
                {inv.tdsRate !== "0" ? (
                  <Item label={`TDS expected (${formatPercent(inv.tdsRate)})`}>
                    <Amount>{money(inv.tdsExpected)}</Amount>
                  </Item>
                ) : null}
                {!isDraft ? (
                  <>
                    <Item label="Paid">
                      <Amount>{money(inv.amountPaid)}</Amount>
                    </Item>
                    <Item label="Credited">
                      <Amount>{money(inv.amountCredited)}</Amount>
                    </Item>
                    <Item label="Balance due">
                      <Amount className="text-app-section">{money(inv.balanceDue)}</Amount>
                    </Item>
                  </>
                ) : null}
                <Item label="Supply">
                  {inv.supplyType.replace(/_/g, " ").toLowerCase()}
                  {inv.placeOfSupply ? ` · ${inv.placeOfSupply}` : ""}
                </Item>
                {inv.fxRateToBase !== "1" ? (
                  <Item label="FX to base" mono>
                    {inv.fxRateToBase}
                  </Item>
                ) : null}
                {inv.poReference ? <Item label="PO reference">{inv.poReference}</Item> : null}
                {inv.sentAt ? (
                  <Item label="Sent" mono>
                    {formatDateTime(new Date(inv.sentAt), "en-GB", actor.timezone)}
                  </Item>
                ) : null}
              </DescriptionList>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Line items</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <THead>
                  <TR>
                    <TH>#</TH>
                    <TH>Description</TH>
                    <TH>SAC/HSN</TH>
                    <TH numeric>Qty</TH>
                    <TH numeric>Rate</TH>
                    <TH numeric>Tax</TH>
                    <TH numeric>Amount</TH>
                  </TR>
                </THead>
                <TBody>
                  {inv.items.map((it) => (
                    <TR key={it.id}>
                      <TD className="text-ink-subtle">{it.position}</TD>
                      <TD className="whitespace-pre-wrap">{it.description}</TD>
                      <TD mono>{it.sacHsnCode ?? "—"}</TD>
                      <TD numeric>
                        {it.quantity.replace(/\.?0+$/, "")} {it.unitType.toLowerCase()}
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
                <CardTitle>Credit notes</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="flex flex-col gap-2 text-app-body">
                  {inv.creditNotes.map((cn) => (
                    <li key={cn.id} className="flex items-center justify-between">
                      <Link href={`/credit-notes/${cn.id}`} className="text-link">
                        <Mono>{cn.number ?? "Draft"}</Mono>
                      </Link>
                      <span className="flex items-center gap-3">
                        <Pill>{cn.status.toLowerCase()}</Pill>
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
                  <CardTitle>Stored documents</CardTitle>
                  <CardDescription>
                    Every version is kept; the verify page lists all hashes.
                  </CardDescription>
                </div>
                <ConfirmAction
                  action={regenerateDocumentAction}
                  title="Generate a new PDF version?"
                  description="Renders again from the frozen snapshot (for example after a renderer fix). Earlier versions stay."
                  confirmLabel="Generate"
                  hidden={{ id }}
                  trigger="New version"
                  triggerVariant="tertiary"
                  size="sm"
                />
              </CardHeader>
              <CardContent>
                {inv.documents.length === 0 ? (
                  <p className="text-app-body text-ink-subtle">
                    The PDF is rendered on first download.
                  </p>
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
                              ? `Password-protected copy ${d.version}`
                              : `Version ${d.version}`}
                          </a>
                          <span className="text-ink-subtle">
                            {" "}
                            · {formatDateTime(
                              new Date(d.generatedAt),
                              "en-GB",
                              actor.timezone,
                            )} · {Math.round(d.byteSize / 1024)} KB
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
                  Drafts preview live in the editor; open{" "}
                  <a
                    className="text-link"
                    href={`/api/documents/preview?invoice=${id}`}
                    target="_blank"
                    rel="noopener"
                  >
                    the watermarked PDF
                  </a>{" "}
                  to see the page.
                </p>
              </CardContent>
            </Card>
          )}
        </aside>
      </div>
    </>
  );
}
