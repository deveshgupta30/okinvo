import type { Metadata } from "next";
import Link from "next/link";
import { FileText } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Amount } from "@/components/ui/mono";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { formatDate, formatMoney } from "@/lib/format";
import { firstNameOf } from "@/lib/names";
import { cn } from "@/lib/utils";
import { requireRole } from "@/server/auth";
import { hasRole } from "@/server/dal/authz";
import { dashboardData, type DashboardBucket } from "@/server/dal/dashboard";
import { listProfiles } from "@/server/dal/profiles";

export async function generateMetadata(): Promise<Metadata> {
  const tc = await getTranslations("common");
  return { title: tc("dashboard") };
}

function Tile({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: "danger" | "warning" | undefined;
}) {
  return (
    <Card className="p-5">
      <p className="text-app-label text-ink-subtle">{label}</p>
      <p
        className={cn(
          "mt-2 text-app-title tabular-nums",
          tone === "danger" && "text-semantic-danger",
          tone === "warning" && "text-semantic-warning",
        )}
      >
        {value}
      </p>
      {sub ? <p className="mt-1 text-app-caption text-ink-subtle">{sub}</p> : null}
    </Card>
  );
}

function bucketValue(b: DashboardBucket[], locale: string, fallback: string) {
  if (b.length === 0) return <Amount>{formatMoney("0", fallback, locale)}</Amount>;
  return (
    <span className="flex flex-col gap-1">
      {b.map((x) => (
        <Amount key={x.currency}>{formatMoney(x.amount, x.currency, locale)}</Amount>
      ))}
    </span>
  );
}

export default async function DashboardPage() {
  const actor = await requireRole("VIEWER");
  const canEdit = hasRole(actor, "EDITOR");
  const [d, profiles] = await Promise.all([dashboardData(actor), listProfiles(actor)]);
  const count = (b: DashboardBucket[]) => b.reduce((n, x) => n + x.count, 0);
  const t = await getTranslations("dashboard");
  const tc = await getTranslations("common");
  const ts = await getTranslations("invoices.shared");
  return (
    <>
      <PageHeader
        title={t("greeting", { name: firstNameOf(actor.name, actor.email) })}
        description={
          d.profileLabel
            ? t("fiscalYearWithBase", {
                year: d.fiscalYear,
                currency: d.baseCurrency,
                profile: d.profileLabel,
              })
            : t("fiscalYear", { year: d.fiscalYear })
        }
        actions={
          <>
            {canEdit ? (
              <Button asChild variant="secondary">
                <Link href="/credit-notes/new">{t("newCreditNote")}</Link>
              </Button>
            ) : null}
            {canEdit ? (
              <Button asChild>
                <Link href="/invoices/new">{ts("newInvoice")}</Link>
              </Button>
            ) : null}
          </>
        }
      />
      {profiles.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={t("welcomeTitle", { appName: tc("appName") })}
          description={t("welcomeDescription")}
          action={
            <Button asChild variant="secondary">
              <Link href="/settings/profiles/new">{t("createProfile")}</Link>
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <Tile
              label={t("tiles.outstanding")}
              value={bucketValue(d.outstanding, d.locale, d.baseCurrency)}
              sub={t("tiles.invoiceCount", { count: count(d.outstanding) })}
            />
            <Tile
              label={t("tiles.overdue")}
              value={bucketValue(d.overdue, d.locale, d.baseCurrency)}
              sub={t("tiles.invoiceCount", { count: count(d.overdue) })}
              tone={count(d.overdue) > 0 ? "danger" : undefined}
            />
            <Tile
              label={t("tiles.billedThisFy")}
              value={<Amount>{formatMoney(d.billedThisFy, d.baseCurrency, d.locale)}</Amount>}
              sub={t("tiles.fyRange", {
                from: formatDate(d.fyRange.from, d.locale),
                to: formatDate(d.fyRange.to, d.locale),
              })}
            />
            <Tile
              label={t("tiles.receivedThisFy")}
              value={<Amount>{formatMoney(d.receivedThisFy, d.baseCurrency, d.locale)}</Amount>}
              sub={t("tiles.receivedHint")}
            />
            <Tile
              label={t("tiles.drafts")}
              value={d.draftsCount}
              sub={d.draftsCount > 0 ? t("tiles.awaitingIssue") : t("tiles.nothingPending")}
              tone={d.draftsCount > 0 ? "warning" : undefined}
            />
          </div>
          <div className="grid gap-6 xl:grid-cols-[7fr_5fr]">
            <Card>
              <CardHeader>
                <CardTitle>{t("recentInvoices")}</CardTitle>
                <Button asChild variant="link">
                  <Link href="/invoices">{t("allInvoices")}</Link>
                </Button>
              </CardHeader>
              <CardContent>
                {d.recent.length === 0 ? (
                  <p className="text-app-body text-ink-subtle">{t("noInvoicesYet")}</p>
                ) : (
                  <Table cards>
                    <THead>
                      <TR>
                        <TH>{t("columns.number")}</TH>
                        <TH>{t("columns.client")}</TH>
                        <TH>{t("columns.issued")}</TH>
                        <TH numeric>{tc("total")}</TH>
                        <TH>{tc("status")}</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {d.recent.map((r) => (
                        <TR key={r.id}>
                          <TD label={t("columns.number")} mono>
                            <Link href={`/invoices/${r.id}`} className="hover:underline">
                              {r.number ?? <span className="text-ink-subtle">{ts("draft")}</span>}
                            </Link>
                          </TD>
                          <TD label={t("columns.client")}>{r.clientName}</TD>
                          <TD label={t("columns.issued")} mono>
                            {formatDate(r.issueDate, r.locale)}
                          </TD>
                          <TD label={tc("total")} numeric>
                            <Amount>{formatMoney(r.total, r.currency, r.locale)}</Amount>
                          </TD>
                          <TD label={tc("status")}>
                            <StatusPill status={r.displayStatus} />
                          </TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>{t("topClients")}</CardTitle>
              </CardHeader>
              <CardContent>
                {d.topClients.length === 0 ? (
                  <p className="text-app-body text-ink-subtle">{t("nothingOutstanding")}</p>
                ) : (
                  <ul className="flex flex-col gap-2 text-app-body">
                    {d.topClients.map((c) => (
                      <li
                        key={`${c.clientId}-${c.currency}`}
                        className="flex items-center justify-between gap-4"
                      >
                        <Link href={`/clients/${c.clientId}`} className="truncate text-link">
                          {c.name}
                        </Link>
                        <Amount>{formatMoney(c.outstanding, c.currency, d.locale)}</Amount>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
