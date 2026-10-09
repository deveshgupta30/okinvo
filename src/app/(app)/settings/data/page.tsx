import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Mono } from "@/components/ui/mono";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { Pill } from "@/components/ui/status-pill";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";
import { requireOwner } from "@/server/auth";
import { readBackupStatus } from "@/server/backup-status";
import { invoiceFiscalYears } from "@/server/dal/invoices";
import { getDefaultProfile, listProfiles } from "@/server/dal/profiles";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings.data");
  return { title: t("metaTitle") };
}

/** Export route id with the catalogue keys of its name and of the filters it applies. */
const DATASETS = [
  { id: "invoices", label: "invoices", filters: "periodIssuer" },
  { id: "invoice-items", label: "invoiceItems", filters: "periodIssuer" },
  { id: "payments", label: "payments", filters: "dateRangeIssuer" },
  { id: "credit-notes", label: "creditNotes", filters: "periodIssuer" },
  { id: "clients", label: "clients", filters: "includesArchived" },
  { id: "services", label: "services", filters: "includesArchived" },
  { id: "gst-summary", label: "gstSummary", filters: "periodIssuer" },
  { id: "tds-summary", label: "tdsSummary", filters: "periodIssuer" },
] as const;

function PeriodFields({
  years,
  profiles,
  idPrefix,
}: {
  years: string[];
  profiles: { id: string; label: string }[];
  idPrefix: string;
}) {
  const t = useTranslations("settings.data.period");
  const tc = useTranslations("common");
  return (
    <div className="grid gap-3 md:grid-cols-4">
      <Field label={t("fiscalYear")} htmlFor={`${idPrefix}-fy`} hint={t("fiscalYearHint")}>
        <Select id={`${idPrefix}-fy`} name="fy" defaultValue="">
          <option value="">{tc("all")}</option>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={tc("from")} htmlFor={`${idPrefix}-from`}>
        <Input id={`${idPrefix}-from`} name="from" type="date" />
      </Field>
      <Field label={tc("to")} htmlFor={`${idPrefix}-to`}>
        <Input id={`${idPrefix}-to`} name="to" type="date" />
      </Field>
      <Field label={t("issuer")} htmlFor={`${idPrefix}-issuer`}>
        <Select id={`${idPrefix}-issuer`} name="issuerProfileId" defaultValue="">
          <option value="">{tc("all")}</option>
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </Select>
      </Field>
    </div>
  );
}

export default async function DataSettingsPage() {
  const actor = await requireOwner();
  const t = await getTranslations("settings.data");
  const tc = await getTranslations("common");
  const [profiles, defaultProfile, backup] = await Promise.all([
    listProfiles(actor),
    getDefaultProfile(actor),
    readBackupStatus(),
  ]);
  const years = await invoiceFiscalYears(defaultProfile?.fiscalYearStartMonth ?? 4);
  const backupPill = !backup.configured
    ? { tone: "neutral" as const, label: t("backups.notWired") }
    : backup.problem
      ? { tone: "danger" as const, label: backup.problem }
      : !backup.status
        ? { tone: "warning" as const, label: t("backups.noRun") }
        : backup.status.ok
          ? { tone: "success" as const, label: t("backups.lastOk") }
          : { tone: "danger" as const, label: t("backups.lastFailed") };
  const mono = (chunks: React.ReactNode) => <Mono>{chunks}</Mono>;

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <div className="flex flex-col gap-6">
        <div className="grid gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>{t("exportAll.title")}</CardTitle>
                <CardDescription>{t.rich("exportAll.description", { mono })}</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              {/* A GET form, not a Link: the router would prefetch the route and start an export. */}
              <form action="/api/exports/all-data" method="get">
                <Button type="submit">{t("exportAll.download")}</Button>
              </form>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <div>
                <CardTitle>{t("exportDocuments.title")}</CardTitle>
                <CardDescription>{t.rich("exportDocuments.description", { mono })}</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <form action="/api/exports/documents" method="get" className="flex flex-col gap-4">
                <PeriodFields years={years} profiles={profiles} idPrefix="docs" />
                <Checkbox name="docx" label={t("exportDocuments.docx")} />
                <div>
                  <Button type="submit" variant="secondary">
                    {t("exportDocuments.download")}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>{t("datasets.title")}</CardTitle>
              <CardDescription>{t("datasets.description")}</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <form method="get" className="flex flex-col gap-4">
              <PeriodFields years={years} profiles={profiles} idPrefix="ds" />
              <input type="hidden" name="archived" value="1" />
              <Table>
                <THead>
                  <TR>
                    <TH>{t("datasets.columns.dataset")}</TH>
                    <TH>{t("datasets.columns.filters")}</TH>
                    <TH>{t("datasets.columns.download")}</TH>
                  </TR>
                </THead>
                <TBody>
                  {DATASETS.map((d) => (
                    <TR key={d.id}>
                      <TD>{t(`datasets.names.${d.label}`)}</TD>
                      <TD className="text-ink-subtle">{t(`datasets.filters.${d.filters}`)}</TD>
                      <TD>
                        <div className="flex gap-2">
                          <Button
                            type="submit"
                            variant="tertiary"
                            size="sm"
                            formAction={`/api/exports/${d.id}`}
                            name="format"
                            value="csv"
                          >
                            CSV
                          </Button>
                          <Button
                            type="submit"
                            variant="tertiary"
                            size="sm"
                            formAction={`/api/exports/${d.id}`}
                            name="format"
                            value="xlsx"
                          >
                            XLSX
                          </Button>
                        </div>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>
                {t("backups.title")} <Pill tone={backupPill.tone}>{backupPill.label}</Pill>
              </CardTitle>
              <CardDescription>{t.rich("backups.description", { mono })}</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {backup.status ? (
              <dl className="grid gap-x-6 gap-y-1 text-app-body md:grid-cols-[auto_1fr]">
                <dt className="text-ink-subtle">{t("backups.finished")}</dt>
                <dd>
                  <Mono>
                    {formatDateTime(
                      new Date(backup.status.finishedAt),
                      actor.locale,
                      actor.timezone,
                    )}
                  </Mono>
                </dd>
                <dt className="text-ink-subtle">{t("backups.databaseDump")}</dt>
                <dd>
                  <Mono>{backup.status.pgDump ?? tc("emptyValue")}</Mono>
                </dd>
                <dt className="text-ink-subtle">{t("backups.storageArchive")}</dt>
                <dd>
                  <Mono>{backup.status.storageArchive ?? tc("emptyValue")}</Mono>
                </dd>
                <dt className="text-ink-subtle">{t("backups.size")}</dt>
                <dd>
                  <Mono>
                    {backup.status.sizeBytes === null
                      ? tc("emptyValue")
                      : t("backups.sizeMb", {
                          size: (backup.status.sizeBytes / 1_048_576).toFixed(1),
                        })}
                  </Mono>
                </dd>
                {backup.status.error ? (
                  <>
                    <dt className="text-ink-subtle">{t("backups.error")}</dt>
                    <dd className="text-semantic-danger">{backup.status.error}</dd>
                  </>
                ) : null}
              </dl>
            ) : null}
            <div className="text-app-body">
              <p className="mb-2 text-ink-subtle">{t("backups.runNow")}</p>
              <pre className="overflow-x-auto rounded-md bg-surface-2 p-3 font-mono text-app-caption text-ink">
                {[
                  "docker compose exec backup /backup/backup.sh --now",
                  "docker compose stop app",
                  "docker compose run --rm backup /backup/restore.sh \\",
                  "  /backups/pg/okinvo-<timestamp>.dump /backups/storage/storage-<timestamp>.tgz",
                  "docker compose start app",
                ].join("\n")}
              </pre>
              <p className="mt-2 text-ink-subtle">{t.rich("backups.restoreDrill", { mono })}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
