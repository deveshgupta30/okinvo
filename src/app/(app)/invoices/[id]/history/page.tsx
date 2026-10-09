import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { SentLog } from "@/components/email/sent-log";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Mono } from "@/components/ui/mono";
import { PageHeader } from "@/components/ui/page-header";
import { Pill } from "@/components/ui/status-pill";
import { TBody, TD, TH, THead, TR, Table, TableEmpty } from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";
import { requireRole } from "@/server/auth";
import { invoiceHistory } from "@/server/dal/audit-log";
import { listEmailMessages } from "@/server/dal/emails";
import { NotFoundError } from "@/server/dal/errors";
import { getInvoice } from "@/server/dal/invoices";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("invoices.history");
  return { title: t("metaTitle") };
}

/** Document lifecycle status → its `invoices.shared.lifecycle` catalogue key. */
const LIFECYCLE_KEY = { DRAFT: "draft", ISSUED: "issued", VOID: "void" } as const;

export default async function InvoiceHistoryPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireRole("VIEWER");
  const { id } = await params;
  const inv = await getInvoice(actor, id).catch((e: unknown) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const [events, emails] = await Promise.all([
    invoiceHistory(actor, id),
    listEmailMessages(actor, { kind: "INVOICE", id }),
  ]);
  const { replaces, replacedBy } = inv;
  const chain = [replaces, replacedBy].filter(Boolean);
  const t = await getTranslations("invoices.history");
  const ts = await getTranslations("invoices.shared");
  const tc = await getTranslations("common");
  const lifecycle = (status: string) =>
    status in LIFECYCLE_KEY
      ? ts(`lifecycle.${LIFECYCLE_KEY[status as keyof typeof LIFECYCLE_KEY]}`)
      : status.toLowerCase();
  return (
    <>
      <PageHeader
        title={
          <>
            {t.rich("title", {
              number: inv.number ?? ts("draft"),
              mono: (chunks) => <Mono className="text-app-title text-ink-subtle">{chunks}</Mono>,
            })}
          </>
        }
        breadcrumb={[
          { href: "/invoices", label: ts("invoices") },
          { href: `/invoices/${id}`, label: inv.number ?? ts("draft") },
        ]}
      />
      <div className="flex flex-col gap-6">
        {chain.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>{t("reissueChain")}</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col gap-1 text-app-body">
                {replaces ? (
                  <li>
                    {t.rich("replaces", {
                      number: replaces.number ?? ts("lifecycle.draft"),
                      link: (chunks) => (
                        <Link href={`/invoices/${replaces.id}`} className="text-link">
                          <Mono>{chunks}</Mono>
                        </Link>
                      ),
                    })}
                  </li>
                ) : null}
                {replacedBy ? (
                  <li>
                    {t.rich("replacedBy", {
                      number: replacedBy.number ?? ts("aDraft"),
                      link: (chunks) => (
                        <Link href={`/invoices/${replacedBy.id}`} className="text-link">
                          <Mono>{chunks}</Mono>
                        </Link>
                      ),
                    })}{" "}
                    <Pill>{lifecycle(replacedBy.status)}</Pill>
                  </li>
                ) : null}
              </ul>
            </CardContent>
          </Card>
        ) : null}
        <Card>
          <CardHeader>
            <CardTitle>{t("auditTrail")}</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <THead>
                <TR>
                  <TH>{t("columns.when")}</TH>
                  <TH>{t("columns.who")}</TH>
                  <TH>{t("columns.action")}</TH>
                  <TH>{t("columns.summary")}</TH>
                </TR>
              </THead>
              <TBody>
                {events.length === 0 ? (
                  <TableEmpty colSpan={4}>{t("noEvents")}</TableEmpty>
                ) : (
                  events.map((e) => (
                    <TR key={e.id}>
                      <TD mono className="whitespace-nowrap">
                        {formatDateTime(new Date(e.createdAt), "en-GB", actor.timezone)}
                      </TD>
                      <TD>{e.actorName ?? e.actorEmail ?? t("system")}</TD>
                      <TD mono>{e.action}</TD>
                      <TD>{e.summary ?? tc("emptyValue")}</TD>
                    </TR>
                  ))
                )}
              </TBody>
            </Table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("emails")}</CardTitle>
          </CardHeader>
          <CardContent>
            <SentLog rows={emails} timeZone={actor.timezone} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
