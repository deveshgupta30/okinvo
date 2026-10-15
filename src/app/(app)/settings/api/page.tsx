import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ConfirmAction } from "@/components/confirm-action";
import { CreateApiKeyForm } from "@/components/settings/api-keys";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Mono } from "@/components/ui/mono";
import { PageHeader } from "@/components/ui/page-header";
import { Pill } from "@/components/ui/status-pill";
import { TBody, TD, TH, THead, TR, Table, TableEmpty } from "@/components/ui/table";
import { scopesForRole } from "@/lib/api/scopes";
import { env } from "@/lib/env";
import { formatDateTime } from "@/lib/format";
import { revokeApiKeyAction } from "@/server/actions/api-keys";
import { requireRole } from "@/server/auth";
import { listApiKeys } from "@/server/dal/api-keys";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings.api");
  return { title: t("metaTitle"), description: t("metaDescription") };
}

export default async function ApiSettingsPage() {
  const actor = await requireRole("VIEWER");
  const t = await getTranslations("settings.api");
  const tc = await getTranslations("common");
  const keys = await listApiKeys(actor);
  const base = env.APP_URL.replace(/\/$/, "");
  const when = (iso: string | null) =>
    iso ? formatDateTime(new Date(iso), actor.locale, actor.timezone) : tc("emptyValue");
  const live = keys.filter((k) => !k.revokedAt);
  const mono = (chunks: React.ReactNode) => <Mono>{chunks}</Mono>;
  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>{t("create.title")}</CardTitle>
              <CardDescription>{t.rich("create.description", { mono })}</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <CreateApiKeyForm allowed={scopesForRole(actor.role)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>{t("keys.title")}</CardTitle>
              <CardDescription>
                {actor.role === "OWNER" ? t("keys.descriptionOwner") : t("keys.descriptionOwn")}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <Table cards>
              <THead>
                <TR>
                  <TH>{t("keys.columns.name")}</TH>
                  <TH>{t("keys.columns.prefix")}</TH>
                  <TH>{t("keys.columns.scopes")}</TH>
                  <TH>{t("keys.columns.owner")}</TH>
                  <TH>{t("keys.columns.lastUsed")}</TH>
                  <TH>{t("keys.columns.expires")}</TH>
                  <TH>{t("keys.columns.status")}</TH>
                  <TH />
                </TR>
              </THead>
              <TBody>
                {keys.length === 0 ? (
                  <TableEmpty colSpan={8}>{t("keys.empty")}</TableEmpty>
                ) : (
                  keys.map((k) => (
                    <TR key={k.id}>
                      <TD label={t("keys.columns.name")}>{k.name}</TD>
                      <TD label={t("keys.columns.prefix")}>
                        <Mono>{k.prefix}…</Mono>
                      </TD>
                      <TD label={t("keys.columns.scopes")}>
                        <span className="app-mono text-app-caption">{k.scopes.join(", ")}</span>
                      </TD>
                      <TD label={t("keys.columns.owner")}>{k.userName}</TD>
                      <TD label={t("keys.columns.lastUsed")}>{when(k.lastUsedAt)}</TD>
                      <TD label={t("keys.columns.expires")}>
                        {k.expiresAt ? when(k.expiresAt) : t("keys.never")}
                      </TD>
                      <TD label={t("keys.columns.status")}>
                        {k.revokedAt ? (
                          <Pill tone="muted">{t("keys.revoked")}</Pill>
                        ) : k.expiresAt && new Date(k.expiresAt) < new Date() ? (
                          <Pill tone="warning">{t("keys.expired")}</Pill>
                        ) : (
                          <Pill tone="success">{tc("active")}</Pill>
                        )}
                      </TD>
                      <TD label="">
                        {!k.revokedAt ? (
                          <ConfirmAction
                            action={revokeApiKeyAction}
                            title={t("keys.revokeTitle", { name: k.name })}
                            description={t("keys.revokeDescription")}
                            confirmLabel={tc("revoke")}
                            hidden={{ id: k.id }}
                            trigger={tc("revoke")}
                            triggerVariant="tertiary"
                            size="sm"
                            destructive
                          />
                        ) : null}
                      </TD>
                    </TR>
                  ))
                )}
              </TBody>
            </Table>
            {live.length > 0 ? (
              <p className="mt-3 text-app-caption text-ink-subtle">
                {t("keys.activeCount", { count: live.length })}
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>{t("examples.title")}</CardTitle>
              <CardDescription>{t.rich("examples.description", { mono })}</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <pre className="overflow-x-auto rounded-md bg-surface-2 p-3 text-app-caption text-ink">
              <code className="app-mono">{`# instance status (scope status:read)
curl -H "Authorization: Bearer $OKINVO_KEY" ${base}/api/health/status

# soon: list invoices (invoices:read), create a draft (invoices:create), download a PDF (documents:read)
curl -H "Authorization: Bearer $OKINVO_KEY" ${base}/api/v1/invoices?page=1
curl -H "Authorization: Bearer $OKINVO_KEY" -H "Content-Type: application/json" \\
  -d '{"issuerProfileId":"…","clientId":"…","items":[{"description":"Work","quantity":"1","unitPrice":"1000"}]}' \\
  ${base}/api/v1/invoices
curl -H "Authorization: Bearer $OKINVO_KEY" -o invoice.pdf ${base}/api/v1/invoices/<id>/pdf`}</code>
            </pre>
            <p className="mt-3 text-app-caption text-ink-subtle">
              {t.rich("examples.rateLimit", { mono })}
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
