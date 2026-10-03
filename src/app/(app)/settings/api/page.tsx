import type { Metadata } from "next";
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

export const metadata: Metadata = {
  title: "API",
  description: "API keys for scripts, the SDK and MCP clients, with curl examples.",
};

export default async function ApiSettingsPage() {
  const actor = await requireRole("VIEWER");
  const keys = await listApiKeys(actor);
  const base = env.APP_URL.replace(/\/$/, "");
  const when = (iso: string | null) =>
    iso ? formatDateTime(new Date(iso), "en-GB", actor.timezone) : "—";
  const live = keys.filter((k) => !k.revokedAt);
  return (
    <>
      <PageHeader
        title="API"
        description="Keys for scripts, the SDK and MCP clients. A key can do at most what your role can; it is shown once."
      />
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Create a key</CardTitle>
              <CardDescription>
                Send it as <Mono>Authorization: Bearer okv_…</Mono>. Keep it out of source code and
                chat logs; revoke it below if it leaks.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <CreateApiKeyForm allowed={scopesForRole(actor.role)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Keys</CardTitle>
              <CardDescription>
                {actor.role === "OWNER"
                  ? "Every key of this instance; owners can revoke any of them."
                  : "Your keys."}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <Table cards>
              <THead>
                <TR>
                  <TH>Name</TH>
                  <TH>Prefix</TH>
                  <TH>Scopes</TH>
                  <TH>Owner</TH>
                  <TH>Last used</TH>
                  <TH>Expires</TH>
                  <TH>Status</TH>
                  <TH />
                </TR>
              </THead>
              <TBody>
                {keys.length === 0 ? (
                  <TableEmpty colSpan={8}>No API keys yet.</TableEmpty>
                ) : (
                  keys.map((k) => (
                    <TR key={k.id}>
                      <TD label="Name">{k.name}</TD>
                      <TD label="Prefix">
                        <Mono>{k.prefix}…</Mono>
                      </TD>
                      <TD label="Scopes">
                        <span className="app-mono text-app-caption">{k.scopes.join(", ")}</span>
                      </TD>
                      <TD label="Owner">{k.userName}</TD>
                      <TD label="Last used">{when(k.lastUsedAt)}</TD>
                      <TD label="Expires">{k.expiresAt ? when(k.expiresAt) : "never"}</TD>
                      <TD label="Status">
                        {k.revokedAt ? (
                          <Pill tone="muted">Revoked</Pill>
                        ) : k.expiresAt && new Date(k.expiresAt) < new Date() ? (
                          <Pill tone="warning">Expired</Pill>
                        ) : (
                          <Pill tone="success">Active</Pill>
                        )}
                      </TD>
                      <TD label="">
                        {!k.revokedAt ? (
                          <ConfirmAction
                            action={revokeApiKeyAction}
                            title={`Revoke ${k.name}?`}
                            description="Clients using this key stop working immediately."
                            confirmLabel="Revoke"
                            hidden={{ id: k.id }}
                            trigger="Revoke"
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
                {live.length} active key{live.length === 1 ? "" : "s"}.
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Examples</CardTitle>
              <CardDescription>
                Replace <Mono>$OKINVO_KEY</Mono> with a key. The versioned REST API, its OpenAPI
                document (<Mono>/api/openapi.json</Mono>), the TypeScript SDK and the MCP server
                arrive with the next tasks of the v1.1 plan; the status endpoint works today.
              </CardDescription>
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
              Over-limit calls answer 429 with a <Mono>Retry-After</Mono> header (120 requests per
              minute per key). A key&apos;s scopes are capped by its owner&apos;s current role.
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
