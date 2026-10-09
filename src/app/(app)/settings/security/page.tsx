import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ConfirmAction } from "@/components/confirm-action";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Mono } from "@/components/ui/mono";
import { PageHeader } from "@/components/ui/page-header";
import { Pill } from "@/components/ui/status-pill";
import { Select } from "@/components/ui/select";
import { TBody, TD, TH, THead, TR, Table, TableEmpty } from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";
import { revokeOtherSessionsAction, revokeSessionAction } from "@/server/actions/sessions";
import { requireOwner } from "@/server/auth";
import { AuditFiltersSchema, auditEntityTypes, listAuditEvents } from "@/server/dal/audit-log";
import { listSessions } from "@/server/dal/sessions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings.security");
  return { title: t("metaTitle") };
}

/** Browser and OS names from a user agent (product names, not UI text); null without one. */
function shortAgent(ua: string | null): { browser: string | null; os: string } | null {
  if (!ua) return null;
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Chrome\//.test(ua)
      ? "Chrome"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Safari\//.test(ua)
          ? "Safari"
          : (ua.split(" ")[0] ?? null);
  const os = /Windows/.test(ua)
    ? "Windows"
    : /Mac OS X/.test(ua)
      ? "macOS"
      : /Android/.test(ua)
        ? "Android"
        : /iPhone|iPad/.test(ua)
          ? "iOS"
          : /Linux/.test(ua)
            ? "Linux"
            : "";
  return { browser, os };
}

export default async function SecurityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requireOwner();
  const t = await getTranslations("settings.security");
  const tc = await getTranslations("common");
  const params = await searchParams;
  const parsed = AuditFiltersSchema.safeParse({
    entityType: params.entityType || undefined,
    entityId: params.entityId || undefined,
    action: params.action || undefined,
    from: params.from || undefined,
    to: params.to || undefined,
    page: params.page ?? 1,
  });
  const filters = parsed.success ? parsed.data : { page: 1 };
  const [sessions, log, entityTypes] = await Promise.all([
    listSessions(actor),
    listAuditEvents(actor, filters),
    auditEntityTypes(),
  ]);
  const tz = actor.timezone;
  const pages = Math.max(1, Math.ceil(log.total / log.pageSize));
  const pageHref = (p: number) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params))
      if (typeof v === "string" && v && k !== "page") q.set(k, v);
    q.set("page", String(p));
    return `/settings/security?${q.toString()}`;
  };
  const agentLabel = (ua: string | null): string => {
    const agent = shortAgent(ua);
    if (!agent) return t("sessions.unknownDevice");
    const browser = agent.browser ?? t("sessions.unknownBrowser");
    return agent.os ? t("sessions.agentOnOs", { browser, os: agent.os }) : browser;
  };
  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>{t("sessions.title")}</CardTitle>
              <CardDescription>{t("sessions.description")}</CardDescription>
            </div>
            <ConfirmAction
              action={revokeOtherSessionsAction}
              title={t("sessions.signOutOthers.title")}
              description={t("sessions.signOutOthers.description")}
              confirmLabel={t("sessions.signOutOthers.confirm")}
              trigger={t("sessions.signOutOthers.trigger")}
              triggerVariant="secondary"
              destructive
            />
          </CardHeader>
          <CardContent>
            <Table>
              <THead>
                <TR>
                  <TH>{t("sessions.columns.device")}</TH>
                  <TH>{t("sessions.columns.ipAddress")}</TH>
                  <TH>{t("sessions.columns.signedIn")}</TH>
                  <TH>{t("sessions.columns.lastSeen")}</TH>
                  <TH>{t("sessions.columns.expires")}</TH>
                  <TH />
                </TR>
              </THead>
              <TBody>
                {sessions.map((s) => (
                  <TR key={s.id}>
                    <TD>
                      <span className="flex items-center gap-2">
                        {agentLabel(s.userAgent)}
                        {s.current ? <Pill tone="success">{t("sessions.thisDevice")}</Pill> : null}
                      </span>
                    </TD>
                    <TD mono>{s.ipAddress ?? tc("emptyValue")}</TD>
                    <TD mono>{formatDateTime(new Date(s.createdAt), "en-GB", tz)}</TD>
                    <TD mono>{formatDateTime(new Date(s.updatedAt), "en-GB", tz)}</TD>
                    <TD mono>{formatDateTime(new Date(s.expiresAt), "en-GB", tz)}</TD>
                    <TD className="text-right">
                      {s.current ? null : (
                        <ConfirmAction
                          action={revokeSessionAction}
                          title={t("sessions.revokeTitle")}
                          confirmLabel={tc("revoke")}
                          hidden={{ id: s.id }}
                          trigger={tc("revoke")}
                          triggerVariant="tertiary"
                          size="sm"
                          destructive
                        />
                      )}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>{t("audit.title")}</CardTitle>
              <CardDescription>{t("audit.count", { count: log.total })}</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <form className="grid gap-3 md:grid-cols-5" role="search">
              <Field label={t("audit.entity")} htmlFor="entityType">
                <Select id="entityType" name="entityType" defaultValue={filters.entityType ?? ""}>
                  <option value="">{tc("all")}</option>
                  {entityTypes.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t("audit.actionContains")} htmlFor="action">
                <Input
                  id="action"
                  name="action"
                  defaultValue={filters.action ?? ""}
                  placeholder="invoice.issued"
                />
              </Field>
              <Field label={tc("from")} htmlFor="from">
                <Input id="from" name="from" type="date" defaultValue={filters.from ?? ""} />
              </Field>
              <Field label={tc("to")} htmlFor="to">
                <Input id="to" name="to" type="date" defaultValue={filters.to ?? ""} />
              </Field>
              <div className="flex items-end gap-2">
                <Button type="submit" variant="secondary">
                  {t("audit.filter")}
                </Button>
                <Button asChild variant="tertiary">
                  <Link href="/settings/security">{t("audit.reset")}</Link>
                </Button>
              </div>
            </form>
            <Table>
              <THead>
                <TR>
                  <TH>{t("audit.columns.when")}</TH>
                  <TH>{t("audit.columns.who")}</TH>
                  <TH>{t("audit.columns.action")}</TH>
                  <TH>{t("audit.columns.entity")}</TH>
                  <TH>{t("audit.columns.summary")}</TH>
                </TR>
              </THead>
              <TBody>
                {log.rows.length === 0 ? (
                  <TableEmpty colSpan={5}>{t("audit.empty")}</TableEmpty>
                ) : (
                  log.rows.map((e) => (
                    <TR key={e.id}>
                      <TD mono className="whitespace-nowrap">
                        {formatDateTime(new Date(e.createdAt), "en-GB", tz)}
                      </TD>
                      <TD>{e.actorName ?? e.actorEmail ?? t("audit.system")}</TD>
                      <TD mono>{e.action}</TD>
                      <TD>
                        <span className="block">{e.entityType}</span>
                        <Mono className="block text-ink-subtle">{e.entityId}</Mono>
                      </TD>
                      <TD>
                        {e.summary ?? tc("emptyValue")}
                        {e.before || e.after ? (
                          <details className="mt-1">
                            <summary className="cursor-pointer text-app-caption text-ink-subtle">
                              {t("audit.changes")}
                            </summary>
                            <pre className="mt-1 max-w-xl overflow-x-auto rounded-md bg-surface-2 p-2 text-app-caption whitespace-pre-wrap text-ink-muted">
                              {JSON.stringify({ before: e.before, after: e.after }, null, 2)}
                            </pre>
                          </details>
                        ) : null}
                      </TD>
                    </TR>
                  ))
                )}
              </TBody>
            </Table>
            {pages > 1 ? (
              <nav
                aria-label={tc("pagination")}
                className="flex items-center justify-between text-app-caption text-ink-subtle"
              >
                <span>{t("audit.page", { page: log.page, pages })}</span>
                <div className="flex gap-2">
                  {log.page > 1 ? (
                    <Button asChild variant="tertiary" size="sm">
                      <Link href={pageHref(log.page - 1)}>{tc("previous")}</Link>
                    </Button>
                  ) : null}
                  {log.page < pages ? (
                    <Button asChild variant="tertiary" size="sm">
                      <Link href={pageHref(log.page + 1)}>{tc("next")}</Link>
                    </Button>
                  ) : null}
                </div>
              </nav>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
