import type { Metadata } from "next";
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

export const metadata: Metadata = { title: "Data" };

const DATASETS: { id: string; label: string; filters: string }[] = [
  { id: "invoices", label: "Invoices register", filters: "period, issuer" },
  { id: "invoice-items", label: "Invoice line items", filters: "period, issuer" },
  { id: "payments", label: "Payments ledger", filters: "date range, issuer" },
  { id: "credit-notes", label: "Credit notes register", filters: "period, issuer" },
  { id: "clients", label: "Clients", filters: "includes archived" },
  { id: "services", label: "Services", filters: "includes archived" },
  { id: "gst-summary", label: "GST summary", filters: "period, issuer" },
  { id: "tds-summary", label: "TDS summary", filters: "period, issuer" },
];

function PeriodFields({
  years,
  profiles,
  idPrefix,
}: {
  years: string[];
  profiles: { id: string; label: string }[];
  idPrefix: string;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-4">
      <Field label="Fiscal year" htmlFor={`${idPrefix}-fy`} hint="Overrides the dates">
        <Select id={`${idPrefix}-fy`} name="fy" defaultValue="">
          <option value="">All</option>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="From" htmlFor={`${idPrefix}-from`}>
        <Input id={`${idPrefix}-from`} name="from" type="date" />
      </Field>
      <Field label="To" htmlFor={`${idPrefix}-to`}>
        <Input id={`${idPrefix}-to`} name="to" type="date" />
      </Field>
      <Field label="Issuer" htmlFor={`${idPrefix}-issuer`}>
        <Select id={`${idPrefix}-issuer`} name="issuerProfileId" defaultValue="">
          <option value="">All</option>
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
  const [profiles, defaultProfile, backup] = await Promise.all([
    listProfiles(actor),
    getDefaultProfile(actor),
    readBackupStatus(),
  ]);
  const years = await invoiceFiscalYears(defaultProfile?.fiscalYearStartMonth ?? 4);
  const backupPill = !backup.configured
    ? { tone: "neutral" as const, label: "No backup service wired" }
    : backup.problem
      ? { tone: "danger" as const, label: backup.problem }
      : !backup.status
        ? { tone: "warning" as const, label: "No backup has run yet" }
        : backup.status.ok
          ? { tone: "success" as const, label: "Last backup OK" }
          : { tone: "danger" as const, label: "Last backup failed" };

  return (
    <>
      <PageHeader
        title="Data"
        description="Everything is portable: datasets as CSV or Excel, a full snapshot for migration, the PDFs for your accountant, and a tested backup routine."
      />
      <div className="flex flex-col gap-6">
        <div className="grid gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Export all data</CardTitle>
                <CardDescription>
                  A ZIP with every dataset as CSV plus <Mono>data.json</Mono>, a relational snapshot
                  of all tables. Encrypted fields (payment-method details, SMTP password) stay out;
                  the README inside lists them.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              {/* A GET form, not a Link: the router would prefetch the route and start an export. */}
              <form action="/api/exports/all-data" method="get">
                <Button type="submit">Download okinvo-data ZIP</Button>
              </form>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Export documents</CardTitle>
                <CardDescription>
                  Every issued and voided invoice and credit-note PDF for a period, named by number,
                  with an <Mono>index.csv</Mono> of numbers, totals and hashes. Missing PDFs are
                  rendered on the way.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <form action="/api/exports/documents" method="get" className="flex flex-col gap-4">
                <PeriodFields years={years} profiles={profiles} idPrefix="docs" />
                <Checkbox name="docx" label="Also include a DOCX copy of every document" />
                <div>
                  <Button type="submit" variant="secondary">
                    Download documents ZIP
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Datasets</CardTitle>
              <CardDescription>
                The same exports the index pages offer, with a period and issuer applied to all of
                them. Payments use the date range; clients and services ignore the period.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <form method="get" className="flex flex-col gap-4">
              <PeriodFields years={years} profiles={profiles} idPrefix="ds" />
              <input type="hidden" name="archived" value="1" />
              <Table>
                <THead>
                  <TR>
                    <TH>Dataset</TH>
                    <TH>Filters applied</TH>
                    <TH>Download</TH>
                  </TR>
                </THead>
                <TBody>
                  {DATASETS.map((d) => (
                    <TR key={d.id}>
                      <TD>{d.label}</TD>
                      <TD className="text-ink-subtle">{d.filters}</TD>
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
                Backups <Pill tone={backupPill.tone}>{backupPill.label}</Pill>
              </CardTitle>
              <CardDescription>
                The Compose <Mono>backup</Mono> service dumps Postgres and archives the storage
                volume on <Mono>BACKUP_CRON</Mono>, keeps <Mono>BACKUP_RETENTION_DAYS</Mono> of
                history in the <Mono>backups</Mono> volume, and writes a status file this page
                reads.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {backup.status ? (
              <dl className="grid gap-x-6 gap-y-1 text-app-body md:grid-cols-[auto_1fr]">
                <dt className="text-ink-subtle">Finished</dt>
                <dd>
                  <Mono>
                    {formatDateTime(new Date(backup.status.finishedAt), "en-GB", actor.timezone)}
                  </Mono>
                </dd>
                <dt className="text-ink-subtle">Database dump</dt>
                <dd>
                  <Mono>{backup.status.pgDump ?? "—"}</Mono>
                </dd>
                <dt className="text-ink-subtle">Storage archive</dt>
                <dd>
                  <Mono>{backup.status.storageArchive ?? "—"}</Mono>
                </dd>
                <dt className="text-ink-subtle">Size</dt>
                <dd>
                  <Mono>
                    {backup.status.sizeBytes === null
                      ? "—"
                      : `${(backup.status.sizeBytes / 1_048_576).toFixed(1)} MB`}
                  </Mono>
                </dd>
                {backup.status.error ? (
                  <>
                    <dt className="text-ink-subtle">Error</dt>
                    <dd className="text-semantic-danger">{backup.status.error}</dd>
                  </>
                ) : null}
              </dl>
            ) : null}
            <div className="text-app-body">
              <p className="mb-2 text-ink-subtle">Run one now, or restore from a pair of files:</p>
              <pre className="overflow-x-auto rounded-md bg-surface-2 p-3 font-mono text-app-caption text-ink">
                {[
                  "docker compose exec backup /backup/backup.sh --now",
                  "docker compose stop app",
                  "docker compose run --rm backup /backup/restore.sh \\",
                  "  /backups/pg/okinvo-<timestamp>.dump /backups/storage/storage-<timestamp>.tgz",
                  "docker compose start app",
                ].join("\n")}
              </pre>
              <p className="mt-2 text-ink-subtle">
                The restore procedure is exercised in CI by <Mono>scripts/restore-drill.sh</Mono>:
                seed, back up, wipe, restore, then compare row counts and a PDF hash.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
