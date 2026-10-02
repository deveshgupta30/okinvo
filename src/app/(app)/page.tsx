import type { Metadata } from "next";
import Link from "next/link";
import { FileText } from "lucide-react";
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
import { requireOwner } from "@/server/auth";
import { dashboardData, type DashboardBucket } from "@/server/dal/dashboard";
import { listProfiles } from "@/server/dal/profiles";

export const metadata: Metadata = { title: "Dashboard" };

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
  const actor = await requireOwner();
  const [d, profiles] = await Promise.all([dashboardData(actor), listProfiles(actor)]);
  const count = (b: DashboardBucket[]) => b.reduce((n, x) => n + x.count, 0);
  return (
    <>
      <PageHeader
        title={`Hi, ${firstNameOf(actor.name, actor.email)}`}
        description={`Fiscal year ${d.fiscalYear}${d.profileLabel ? ` · base currency ${d.baseCurrency} (${d.profileLabel})` : ""}`}
        actions={
          <>
            <Button asChild variant="secondary">
              <Link href="/credit-notes/new">New credit note</Link>
            </Button>
            <Button asChild>
              <Link href="/invoices/new">New invoice</Link>
            </Button>
          </>
        }
      />
      {profiles.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Welcome to okinvo"
          description="Start by creating the issuer profile you bill from, then add a client and your first invoice."
          action={
            <Button asChild variant="secondary">
              <Link href="/settings/profiles/new">Create your profile</Link>
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <Tile
              label="Outstanding"
              value={bucketValue(d.outstanding, d.locale, d.baseCurrency)}
              sub={`${count(d.outstanding)} invoice${count(d.outstanding) === 1 ? "" : "s"}`}
            />
            <Tile
              label="Overdue"
              value={bucketValue(d.overdue, d.locale, d.baseCurrency)}
              sub={`${count(d.overdue)} invoice${count(d.overdue) === 1 ? "" : "s"}`}
              tone={count(d.overdue) > 0 ? "danger" : undefined}
            />
            <Tile
              label="Billed this FY"
              value={<Amount>{formatMoney(d.billedThisFy, d.baseCurrency, d.locale)}</Amount>}
              sub={`${formatDate(d.fyRange.from, d.locale)} – ${formatDate(d.fyRange.to, d.locale)}`}
            />
            <Tile
              label="Received this FY"
              value={<Amount>{formatMoney(d.receivedThisFy, d.baseCurrency, d.locale)}</Amount>}
              sub="Payments less refunds, at recorded FX"
            />
            <Tile
              label="Drafts"
              value={d.draftsCount}
              sub={d.draftsCount > 0 ? "awaiting issue" : "nothing pending"}
              tone={d.draftsCount > 0 ? "warning" : undefined}
            />
          </div>
          <div className="grid gap-6 xl:grid-cols-[7fr_5fr]">
            <Card>
              <CardHeader>
                <CardTitle>Recent invoices</CardTitle>
                <Button asChild variant="link">
                  <Link href="/invoices">All invoices</Link>
                </Button>
              </CardHeader>
              <CardContent>
                {d.recent.length === 0 ? (
                  <p className="text-app-body text-ink-subtle">No invoices yet.</p>
                ) : (
                  <Table cards>
                    <THead>
                      <TR>
                        <TH>Number</TH>
                        <TH>Client</TH>
                        <TH>Issued</TH>
                        <TH numeric>Total</TH>
                        <TH>Status</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {d.recent.map((r) => (
                        <TR key={r.id}>
                          <TD label="Number" mono>
                            <Link href={`/invoices/${r.id}`} className="hover:underline">
                              {r.number ?? <span className="text-ink-subtle">Draft</span>}
                            </Link>
                          </TD>
                          <TD label="Client">{r.clientName}</TD>
                          <TD label="Issued" mono>
                            {formatDate(r.issueDate, r.locale)}
                          </TD>
                          <TD label="Total" numeric>
                            <Amount>{formatMoney(r.total, r.currency, r.locale)}</Amount>
                          </TD>
                          <TD label="Status">
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
                <CardTitle>Top clients by outstanding</CardTitle>
              </CardHeader>
              <CardContent>
                {d.topClients.length === 0 ? (
                  <p className="text-app-body text-ink-subtle">Nothing outstanding.</p>
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
