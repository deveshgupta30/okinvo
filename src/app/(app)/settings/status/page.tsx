import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Mono } from "@/components/ui/mono";
import { PageHeader } from "@/components/ui/page-header";
import { Pill, type Tone } from "@/components/ui/status-pill";
import { formatDateTime } from "@/lib/format";
import { requireRole } from "@/server/auth";
import { collectStatus, type Health } from "@/server/status";

export const metadata: Metadata = {
  title: "Status",
  description: "Version, database, storage, e-mail and backup health of this instance.",
};

export const dynamic = "force-dynamic";

const TONE: Record<Health, Tone> = {
  ok: "success",
  warning: "warning",
  failed: "danger",
  "n/a": "muted",
};
const LABEL: Record<Health, string> = {
  ok: "OK",
  warning: "Warning",
  failed: "Failed",
  "n/a": "Not configured",
};

function Row({ name, health, detail }: { name: string; health: Health; detail: React.ReactNode }) {
  return (
    <div
      data-status-row={name}
      className="grid gap-1 border-b border-hairline py-3 last:border-0 sm:grid-cols-[10rem_8rem_1fr] sm:items-start sm:gap-4"
    >
      <span className="text-app-label text-ink">{name}</span>
      <span>
        <Pill tone={TONE[health]}>{LABEL[health]}</Pill>
      </span>
      <span className="text-app-caption text-ink-subtle">{detail}</span>
    </div>
  );
}

function uptime(seconds: number): string {
  const d = Math.floor(seconds / 86_400);
  const h = Math.floor((seconds % 86_400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return d > 0 ? `${d}d ${h}h ${m}m` : h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default async function StatusPage() {
  const actor = await requireRole("VIEWER");
  const s = await collectStatus();
  const when = (iso: string | null) =>
    iso ? formatDateTime(new Date(iso), "en-GB", actor.timezone) : "—";
  const overallTone: Tone =
    s.overall === "ok" ? "success" : s.overall === "degraded" ? "warning" : "danger";
  return (
    <>
      <PageHeader
        title="Status"
        description="What this instance is running and whether its parts answer."
        actions={
          <Button asChild variant="secondary">
            <Link href="/settings/status">Re-check</Link>
          </Button>
        }
      />
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <CardTitle>
              okinvo <Mono data-status-version>{s.version.app}</Mono>
            </CardTitle>
            <Pill tone={overallTone}>
              {s.overall === "ok" ? "All good" : s.overall === "degraded" ? "Degraded" : "Failed"}
            </Pill>
          </div>
          <CardDescription>
            Build {s.version.sha ? <Mono>{s.version.sha.slice(0, 12)}</Mono> : "(sha unknown)"} ·
            built {s.version.builtAt ? when(s.version.builtAt) : "(date unknown)"} · Node{" "}
            <Mono>{s.version.node}</Mono> · up {uptime(s.uptimeSeconds)} · checked{" "}
            {when(s.checkedAt)}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Row
            name="Database"
            health={s.db.health}
            detail={
              s.db.health === "failed" ? (
                s.db.error
              ) : (
                <>
                  {s.db.latencyMs} ms · last migration{" "}
                  <Mono>{s.db.lastMigration?.name ?? "none"}</Mono>
                  {s.db.lastMigration ? ` (${when(s.db.lastMigration.finishedAt)})` : ""}
                  {s.db.pending > 0 ? ` · ${s.db.pending} unfinished migration(s)` : ""}
                </>
              )
            }
          />
          <Row
            name="Storage"
            health={s.storage.health}
            detail={
              s.storage.health === "failed" ? (
                `${s.storage.driver}: ${s.storage.error}`
              ) : (
                <>
                  <Mono>{s.storage.driver}</Mono> · write, read and delete of a probe object in{" "}
                  {s.storage.latencyMs} ms
                </>
              )
            }
          />
          <Row
            name="Rate limiting"
            health="ok"
            detail={
              <>
                <Mono>{s.rateLimitStore}</Mono> store
                {s.rateLimitStore === "memory" ? " (one replica)" : " (shared across replicas)"}
              </>
            }
          />
          <Row
            name="E-mail"
            health={s.smtp.health}
            detail={
              s.smtp.configured ? (
                <>
                  SMTP from {s.smtp.source} · last test {when(s.smtp.lastTestAt)} · last 24 h:{" "}
                  {s.email24h.sent} sent, {s.email24h.failed} failed
                </>
              ) : (
                <>
                  No SMTP server; the composer offers &ldquo;Open in mail app&rdquo;.{" "}
                  <Link href="/settings/email" className="text-link">
                    Configure
                  </Link>
                </>
              )
            }
          />
          <Row
            name="Backups"
            health={s.backups.health}
            detail={
              !s.backups.view.configured ? (
                "No backup service wired (BACKUP_STATUS_FILE unset)."
              ) : s.backups.view.problem ? (
                s.backups.view.problem
              ) : !s.backups.view.status ? (
                "Backup service wired; no run recorded yet."
              ) : (
                <>
                  {s.backups.view.status.ok
                    ? "Last run succeeded"
                    : `Last run failed: ${s.backups.view.status.error}`}{" "}
                  at {when(s.backups.view.status.finishedAt)}
                  {s.backups.view.status.retentionDays
                    ? ` · retention ${s.backups.view.status.retentionDays} days`
                    : ""}
                </>
              )
            }
          />
        </CardContent>
      </Card>
      <p className="mt-4 text-app-caption text-ink-tertiary">
        The same report is available as JSON at <Mono>/api/health/status</Mono> for monitoring
        (signed-in session or API key).
      </p>
    </>
  );
}
