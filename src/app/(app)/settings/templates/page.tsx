import type { Metadata } from "next";
import Link from "next/link";
import { ConfirmAction } from "@/components/confirm-action";
import { ImportTemplateForm } from "@/components/templates/import-form";
import { TemplateForm } from "@/components/templates/template-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Pill } from "@/components/ui/status-pill";
import { resetTemplateAction } from "@/server/actions/templates";
import { requireOwner } from "@/server/auth";
import { getTemplateSettings } from "@/server/dal/templates";

export const metadata: Metadata = { title: "Document templates" };

export default async function TemplatesPage() {
  const actor = await requireOwner();
  const settings = await getTemplateSettings(actor);
  return (
    <>
      <PageHeader
        title={
          <>
            Document templates
            <Pill tone={settings.source === "setting" ? "success" : "neutral"}>
              {settings.source === "setting" ? "Customised" : "Built-in default"}
            </Pill>
          </>
        }
        description="How invoices and credit notes look. Issued documents keep the template they were issued with."
        actions={
          <ConfirmAction
            action={resetTemplateAction}
            title="Reset to the built-in default?"
            description="Your customisation is removed; already issued documents are unaffected."
            confirmLabel="Reset"
            trigger="Reset to defaults"
            triggerVariant="tertiary"
            destructive
          />
        }
      />
      <div className="flex flex-col gap-6">
        <TemplateForm scope="instance" initial={settings.config} />
        <div className="grid gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Import</CardTitle>
                <CardDescription>Restore a configuration exported earlier.</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <ImportTemplateForm />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Per-profile overrides</CardTitle>
                <CardDescription>
                  A profile can opt into its own template from its edit page.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              {settings.overrides.length === 0 ? (
                <p className="text-app-body text-ink-subtle">
                  Every profile uses the instance template.
                </p>
              ) : (
                <ul className="flex flex-col gap-2 text-app-body">
                  {settings.overrides.map((o) => (
                    <li key={o.profileId} className="flex items-center justify-between">
                      <Link
                        href={`/settings/profiles/${o.profileId}/template`}
                        className="text-link"
                      >
                        {o.label}
                      </Link>
                      <Pill>{o.templateId}</Pill>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
