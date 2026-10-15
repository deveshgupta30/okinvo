import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ConfirmAction } from "@/components/confirm-action";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DescriptionList, Item } from "@/components/ui/description-list";
import { Amount, Mono } from "@/components/ui/mono";
import { PageHeader } from "@/components/ui/page-header";
import { Pill, StatusPill } from "@/components/ui/status-pill";
import { TBody, TD, TH, THead, TR, Table, TableEmpty } from "@/components/ui/table";
import { formatDate, formatMoney } from "@/lib/format";
import { formatAddressLines } from "@/lib/schemas";
import {
  archiveClientAction,
  deleteClientAction,
  unarchiveClientAction,
} from "@/server/actions/clients";
import { requireRole } from "@/server/auth";
import { hasRole } from "@/server/dal/authz";
import { clientSummary, getClient } from "@/server/dal/clients";
import { NotFoundError } from "@/server/dal/errors";
import { listInvoices } from "@/server/dal/invoices";
import { getDefaultProfile } from "@/server/dal/profiles";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("clients.detail");
  return { title: t("metaTitle") };
}

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireRole("VIEWER");
  const t = await getTranslations("clients.detail");
  const tl = await getTranslations("clients.list");
  const tc = await getTranslations("common");
  const tu = await getTranslations("ui");
  const canEdit = hasRole(actor, "EDITOR");
  const { id } = await params;
  const client = await getClient(actor, id).catch((e: unknown) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const [summary, invoices, defaultProfile] = await Promise.all([
    clientSummary(actor, client.id),
    listInvoices(actor, { clientId: client.id }),
    getDefaultProfile(actor),
  ]);
  const recent = invoices.slice(0, 10);
  const locale = defaultProfile?.locale ?? "en-IN";
  const returnTo = `/clients/${client.id}`;
  return (
    <>
      <PageHeader
        title={
          <>
            {client.displayName}
            {client.archivedAt ? <Pill>{tu("activePill.archived")}</Pill> : null}
          </>
        }
        breadcrumb={[{ href: "/clients", label: tl("title") }]}
        actions={
          canEdit ? (
            <>
              <Button asChild variant="secondary">
                <Link href={`/invoices/new?client=${client.id}`}>{t("newInvoice")}</Link>
              </Button>
              <Button asChild variant="tertiary">
                <Link href={`/clients/${client.id}/edit`}>{tc("edit")}</Link>
              </Button>
              {client.archivedAt ? (
                <ConfirmAction
                  action={unarchiveClientAction}
                  title={t("restoreTitle")}
                  confirmLabel={tc("restore")}
                  hidden={{ id: client.id, returnTo }}
                  trigger={tc("restore")}
                  triggerVariant="tertiary"
                />
              ) : (
                <ConfirmAction
                  action={archiveClientAction}
                  title={t("archiveTitle")}
                  description={t("archiveDescription")}
                  confirmLabel={tc("archive")}
                  hidden={{ id: client.id, returnTo }}
                  trigger={tc("archive")}
                  triggerVariant="tertiary"
                  destructive
                />
              )}
              <ConfirmAction
                action={deleteClientAction}
                title={t("deleteTitle")}
                description={t("deleteDescription")}
                confirmLabel={tc("delete")}
                hidden={{ id: client.id }}
                trigger={tc("delete")}
                triggerVariant="tertiary"
                destructive
              />
            </>
          ) : null
        }
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("details")}</CardTitle>
          </CardHeader>
          <CardContent>
            <DescriptionList>
              <Item label={t("contact")}>{client.contactPerson}</Item>
              <Item label={t("email")}>{client.email}</Item>
              <Item label={t("phone")}>{client.phone}</Item>
              <Item label={t("country")} mono>
                {client.countryCode}
                {client.stateCode ? ` · ${client.stateCode}` : ""}
                {client.gstStateCode ? ` · ${t("gstState", { code: client.gstStateCode })}` : ""}
              </Item>
              <Item label={t("taxId")} mono>
                {client.taxId ? `${client.taxIdType ?? ""} ${client.taxId}`.trim() : null}
              </Item>
              <Item label={t("currency")} mono>
                {client.currency}
              </Item>
              <Item label={t("paymentTerms")}>
                {t("paymentTermsDays", { days: client.paymentTermsDays })}
              </Item>
              <Item label={t("expectedTds")}>
                {client.defaultTdsRate ? `${client.defaultTdsRate}%` : null}
              </Item>
              <Item label={t("notes")}>{client.notes}</Item>
            </DescriptionList>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("addresses")}</CardTitle>
          </CardHeader>
          <CardContent>
            <DescriptionList>
              <Item label={t("billing")}>
                {formatAddressLines(client.billingAddress).map((l) => (
                  <span key={l} className="block">
                    {l}
                  </span>
                ))}
              </Item>
              <Item label={t("shipping")}>
                {client.shippingAddress
                  ? formatAddressLines(client.shippingAddress).map((l) => (
                      <span key={l} className="block">
                        {l}
                      </span>
                    ))
                  : null}
              </Item>
            </DescriptionList>
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t("lifetime")}</CardTitle>
            <Button asChild variant="link">
              <Link href={`/invoices?clientId=${client.id}`}>{t("openRegister")}</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {summary.currencies.length === 0 ? (
              <p className="text-app-body text-ink-subtle">
                {summary.drafts > 0
                  ? t("noIssuedWithDrafts", { drafts: summary.drafts })
                  : t("noIssued")}
              </p>
            ) : (
              <div className="flex flex-col gap-4">
                <Table>
                  <THead>
                    <TR>
                      <TH>{t("lifetimeColumns.currency")}</TH>
                      <TH numeric>{t("lifetimeColumns.invoices")}</TH>
                      <TH numeric>{t("lifetimeColumns.billed")}</TH>
                      <TH numeric>{t("lifetimeColumns.received")}</TH>
                      <TH numeric>{t("lifetimeColumns.credited")}</TH>
                      <TH numeric>{t("lifetimeColumns.outstanding")}</TH>
                      <TH numeric>{t("lifetimeColumns.overdue")}</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {summary.currencies.map((c) => (
                      <TR key={c.currency}>
                        <TD mono>{c.currency}</TD>
                        <TD numeric mono>
                          {c.invoices}
                        </TD>
                        <TD numeric>
                          <Amount>{formatMoney(c.billed, c.currency, locale)}</Amount>
                        </TD>
                        <TD numeric>
                          <Amount>{formatMoney(c.received, c.currency, locale)}</Amount>
                        </TD>
                        <TD numeric>
                          <Amount>{formatMoney(c.credited, c.currency, locale)}</Amount>
                        </TD>
                        <TD numeric>
                          <Amount>{formatMoney(c.outstanding, c.currency, locale)}</Amount>
                        </TD>
                        <TD numeric>
                          <Amount
                            className={c.overdueCount > 0 ? "text-semantic-danger" : undefined}
                          >
                            {formatMoney(c.overdue, c.currency, locale)}
                          </Amount>
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
                <p className="text-app-caption text-ink-subtle">
                  {t.rich("firstLatest", {
                    first: summary.firstInvoiceDate
                      ? formatDate(summary.firstInvoiceDate, locale)
                      : tc("emptyValue"),
                    latest: summary.lastInvoiceDate
                      ? formatDate(summary.lastInvoiceDate, locale)
                      : tc("emptyValue"),
                    drafts: summary.drafts,
                    mono: (chunks) => <Mono>{chunks}</Mono>,
                  })}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t("recentInvoices")}</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <THead>
                <TR>
                  <TH>{t("recentColumns.number")}</TH>
                  <TH>{t("recentColumns.issueDate")}</TH>
                  <TH>{t("recentColumns.due")}</TH>
                  <TH numeric>{t("recentColumns.total")}</TH>
                  <TH numeric>{t("recentColumns.balance")}</TH>
                  <TH>{t("recentColumns.status")}</TH>
                </TR>
              </THead>
              <TBody>
                {recent.length === 0 ? (
                  <TableEmpty colSpan={6}>{t("noInvoices")}</TableEmpty>
                ) : (
                  recent.map((r) => (
                    <TR key={r.id}>
                      <TD mono>
                        <Link href={`/invoices/${r.id}`} className="hover:underline">
                          {r.number ?? (
                            <span className="text-ink-subtle">{tu("statusPill.DRAFT")}</span>
                          )}
                        </Link>
                      </TD>
                      <TD mono>{formatDate(r.issueDate, r.locale)}</TD>
                      <TD mono>{formatDate(r.dueDate, r.locale)}</TD>
                      <TD numeric>
                        <Amount>{formatMoney(r.total, r.currency, r.locale)}</Amount>
                      </TD>
                      <TD numeric>
                        <Amount>
                          {r.status === "ISSUED"
                            ? formatMoney(r.balanceDue, r.currency, r.locale)
                            : tc("emptyValue")}
                        </Amount>
                      </TD>
                      <TD>
                        <StatusPill status={r.displayStatus} />
                      </TD>
                    </TR>
                  ))
                )}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
