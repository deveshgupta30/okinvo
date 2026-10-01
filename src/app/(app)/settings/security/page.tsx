import type { Metadata } from "next";
import Link from "next/link";
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

export const metadata: Metadata = { title: "Security" };

function shortAgent(ua: string | null): string {
  if (!ua) return "Unknown device";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Chrome\//.test(ua)
      ? "Chrome"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Safari\//.test(ua)
          ? "Safari"
          : (ua.split(" ")[0] ?? "Unknown");
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
  return os ? `${browser} on ${os}` : browser;
}

export default async function SecurityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requireOwner();
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
  return (
    <>
      <PageHeader
        title="Security"
        description="Where you are signed in, and everything that changed."
      />
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Active sessions</CardTitle>
              <CardDescription>
                Revoking a session signs that device out immediately.
              </CardDescription>
            </div>
            <ConfirmAction
              action={revokeOtherSessionsAction}
              title="Sign out everywhere else?"
              description="Every session except this one is revoked."
              confirmLabel="Sign out others"
              trigger="Sign out everywhere else"
              triggerVariant="secondary"
              destructive
            />
          </CardHeader>
          <CardContent>
            <Table>
              <THead>
                <TR>
                  <TH>Device</TH>
                  <TH>IP address</TH>
                  <TH>Signed in</TH>
                  <TH>Last seen</TH>
                  <TH>Expires</TH>
                  <TH />
                </TR>
              </THead>
              <TBody>
                {sessions.map((s) => (
                  <TR key={s.id}>
                    <TD>
                      <span className="flex items-center gap-2">
                        {shortAgent(s.userAgent)}
                        {s.current ? <Pill tone="success">This device</Pill> : null}
                      </span>
                    </TD>
                    <TD mono>{s.ipAddress ?? "—"}</TD>
                    <TD mono>{formatDateTime(new Date(s.createdAt), "en-GB", tz)}</TD>
                    <TD mono>{formatDateTime(new Date(s.updatedAt), "en-GB", tz)}</TD>
                    <TD mono>{formatDateTime(new Date(s.expiresAt), "en-GB", tz)}</TD>
                    <TD className="text-right">
                      {s.current ? null : (
                        <ConfirmAction
                          action={revokeSessionAction}
                          title="Revoke this session?"
                          confirmLabel="Revoke"
                          hidden={{ id: s.id }}
                          trigger="Revoke"
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
              <CardTitle>Audit log</CardTitle>
              <CardDescription>{log.total} events</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <form className="grid gap-3 md:grid-cols-5" role="search">
              <Field label="Entity" htmlFor="entityType">
                <Select id="entityType" name="entityType" defaultValue={filters.entityType ?? ""}>
                  <option value="">All</option>
                  {entityTypes.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Action contains" htmlFor="action">
                <Input
                  id="action"
                  name="action"
                  defaultValue={filters.action ?? ""}
                  placeholder="invoice.issued"
                />
              </Field>
              <Field label="From" htmlFor="from">
                <Input id="from" name="from" type="date" defaultValue={filters.from ?? ""} />
              </Field>
              <Field label="To" htmlFor="to">
                <Input id="to" name="to" type="date" defaultValue={filters.to ?? ""} />
              </Field>
              <div className="flex items-end gap-2">
                <Button type="submit" variant="secondary">
                  Filter
                </Button>
                <Button asChild variant="tertiary">
                  <Link href="/settings/security">Reset</Link>
                </Button>
              </div>
            </form>
            <Table>
              <THead>
                <TR>
                  <TH>When</TH>
                  <TH>Who</TH>
                  <TH>Action</TH>
                  <TH>Entity</TH>
                  <TH>Summary</TH>
                </TR>
              </THead>
              <TBody>
                {log.rows.length === 0 ? (
                  <TableEmpty colSpan={5}>No events match these filters.</TableEmpty>
                ) : (
                  log.rows.map((e) => (
                    <TR key={e.id}>
                      <TD mono className="whitespace-nowrap">
                        {formatDateTime(new Date(e.createdAt), "en-GB", tz)}
                      </TD>
                      <TD>{e.actorName ?? e.actorEmail ?? "System"}</TD>
                      <TD mono>{e.action}</TD>
                      <TD>
                        <span className="block">{e.entityType}</span>
                        <Mono className="block text-ink-subtle">{e.entityId}</Mono>
                      </TD>
                      <TD>
                        {e.summary ?? "—"}
                        {e.before || e.after ? (
                          <details className="mt-1">
                            <summary className="cursor-pointer text-app-caption text-ink-subtle">
                              Changes
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
                aria-label="Pagination"
                className="flex items-center justify-between text-app-caption text-ink-subtle"
              >
                <span>
                  Page {log.page} of {pages}
                </span>
                <div className="flex gap-2">
                  {log.page > 1 ? (
                    <Button asChild variant="tertiary" size="sm">
                      <Link href={pageHref(log.page - 1)}>Previous</Link>
                    </Button>
                  ) : null}
                  {log.page < pages ? (
                    <Button asChild variant="tertiary" size="sm">
                      <Link href={pageHref(log.page + 1)}>Next</Link>
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
