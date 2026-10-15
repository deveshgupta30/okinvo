import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Mono } from "@/components/ui/mono";
import { PageHeader } from "@/components/ui/page-header";
import { Pill, type Tone } from "@/components/ui/status-pill";
import { formatDateTime } from "@/lib/format";
import { requireRole } from "@/server/auth";
import { collectStatus, type Health } from "@/server/status";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings.status");
  return { title: t("metaTitle"), description: t("metaDescription") };
}

export const dynamic = "force-dynamic";

const TONE: Record<Health, Tone> = {
  ok: "success",
  warning: "warning",
  failed: "danger",
  "n/a": "muted",
};
/** Health value to the catalogue key of its label under `health`. */
const HEALTH_KEY = {
  ok: "ok",
  warning: "warning",
  failed: "failed",
  "n/a": "na",
} as const satisfies Record<Health, string>;

/** `name` is the stable `data-status-row` id; `label` is what the row shows. */
function Row({
  name,
  label,
  healthLabel,
  health,
  detail,
}: {
  name: string;
  label: string;
  healthLabel: string;
  health: Health;
  detail: React.ReactNode;
}) {
  return (
    <div
      data-status-row={name}
      className="grid gap-1 border-b border-hairline py-3 last:border-0 sm:grid-cols-[10rem_8rem_1fr] sm:items-start sm:gap-4"
    >
      <span className="text-app-label text-ink">{label}</span>
      <span>
        <Pill tone={TONE[health]}>{healthLabel}</Pill>
      </span>
      <span className="text-app-caption text-ink-subtle">{detail}</span>
    </div>
  );
}

export default async function StatusPage() {
  const actor = await requireRole("VIEWER");
  const t = await getTranslations("settings.status");
  const tc = await getTranslations("common");
  const s = await collectStatus();
  const when = (iso: string | null) =>
    iso ? formatDateTime(new Date(iso), actor.locale, actor.timezone) : tc("emptyValue");
  const uptime = (seconds: number): string => {
    const d = Math.floor(seconds / 86_400);
    const h = Math.floor((seconds % 86_400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return d > 0
      ? t("uptime.days", { d, h, m })
      : h > 0
        ? t("uptime.hours", { h, m })
        : t("uptime.minutes", { m });
  };
  const healthLabel = (health: Health) => t(`health.${HEALTH_KEY[health]}`);
  const mono = (chunks: React.ReactNode) => <Mono>{chunks}</Mono>;
  const overallTone: Tone =
    s.overall === "ok" ? "success" : s.overall === "degraded" ? "warning" : "danger";
  const backupStatus = s.backups.view.status;
  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <Button asChild variant="secondary">
            <Link href="/settings/status">{t("recheck")}</Link>
          </Button>
        }
      />
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <CardTitle>
              {tc("appName")} <Mono data-status-version>{s.version.app}</Mono>
            </CardTitle>
            <Pill tone={overallTone}>
              {s.overall === "ok"
                ? t("overall.ok")
                : s.overall === "degraded"
                  ? t("overall.degraded")
                  : t("overall.failed")}
            </Pill>
          </div>
          <CardDescription>
            {t.rich("version", {
              hasSha: s.version.sha ? "yes" : "no",
              sha: s.version.sha ? s.version.sha.slice(0, 12) : "",
              built: s.version.builtAt ? when(s.version.builtAt) : t("dateUnknown"),
              node: s.version.node,
              uptime: uptime(s.uptimeSeconds),
              checked: when(s.checkedAt),
              mono,
            })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Row
            name="Database"
            label={t("rows.database")}
            healthLabel={healthLabel(s.db.health)}
            health={s.db.health}
            detail={
              s.db.health === "failed"
                ? s.db.error
                : t.rich("db.detail", {
                    latency: s.db.latencyMs ?? "",
                    migration: s.db.lastMigration?.name ?? t("db.noMigration"),
                    hasDate: s.db.lastMigration ? "yes" : "no",
                    finishedAt: s.db.lastMigration ? when(s.db.lastMigration.finishedAt) : "",
                    pending: s.db.pending,
                    mono,
                  })
            }
          />
          <Row
            name="Storage"
            label={t("rows.storage")}
            healthLabel={healthLabel(s.storage.health)}
            health={s.storage.health}
            detail={
              s.storage.health === "failed"
                ? t("storage.failed", { driver: s.storage.driver, error: s.storage.error ?? "" })
                : t.rich("storage.detail", {
                    driver: s.storage.driver,
                    latency: s.storage.latencyMs ?? "",
                    mono,
                  })
            }
          />
          <Row
            name="Rate limiting"
            label={t("rows.rateLimiting")}
            healthLabel={healthLabel("ok")}
            health="ok"
            detail={t.rich("rateLimit", { store: s.rateLimitStore, mono })}
          />
          <Row
            name="E-mail"
            label={t("rows.email")}
            healthLabel={healthLabel(s.smtp.health)}
            health={s.smtp.health}
            detail={
              s.smtp.configured
                ? t("smtp.configured", {
                    source: s.smtp.source ?? "none",
                    lastTest: when(s.smtp.lastTestAt),
                    sent: s.email24h.sent,
                    failed: s.email24h.failed,
                  })
                : t.rich("smtp.none", {
                    link: (chunks) => (
                      <Link href="/settings/email" className="text-link">
                        {chunks}
                      </Link>
                    ),
                  })
            }
          />
          <Row
            name="Backups"
            label={t("rows.backups")}
            healthLabel={healthLabel(s.backups.health)}
            health={s.backups.health}
            detail={
              !s.backups.view.configured
                ? t("backups.notWired")
                : s.backups.view.problem
                  ? s.backups.view.problem
                  : !backupStatus
                    ? t("backups.noRun")
                    : backupStatus.ok
                      ? t("backups.ok", {
                          finishedAt: when(backupStatus.finishedAt),
                          days: backupStatus.retentionDays ?? 0,
                        })
                      : t("backups.failed", {
                          error: backupStatus.error ?? "",
                          finishedAt: when(backupStatus.finishedAt),
                          days: backupStatus.retentionDays ?? 0,
                        })
            }
          />
        </CardContent>
      </Card>
      <p className="mt-4 text-app-caption text-ink-tertiary">{t.rich("footer", { mono })}</p>
    </>
  );
}
