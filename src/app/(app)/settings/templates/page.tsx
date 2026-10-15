import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ConfirmAction } from "@/components/confirm-action";
import { ImportTemplateForm } from "@/components/templates/import-form";
import { TemplateForm } from "@/components/templates/template-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Pill } from "@/components/ui/status-pill";
import { resetTemplateAction } from "@/server/actions/templates";
import { requireOwner } from "@/server/auth";
import { getTemplateSettings } from "@/server/dal/templates";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings.templates");
  return { title: t("metaTitle") };
}

export default async function TemplatesPage() {
  const actor = await requireOwner();
  const t = await getTranslations("settings.templates");
  const settings = await getTemplateSettings(actor);
  return (
    <>
      <PageHeader
        title={
          <>
            {t("title")}
            <Pill tone={settings.source === "setting" ? "success" : "neutral"}>
              {settings.source === "setting" ? t("customised") : t("builtIn")}
            </Pill>
          </>
        }
        description={t("description")}
        actions={
          <ConfirmAction
            action={resetTemplateAction}
            title={t("resetTitle")}
            description={t("resetDescription")}
            confirmLabel={t("reset")}
            trigger={t("resetTrigger")}
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
                <CardTitle>{t("importTitle")}</CardTitle>
                <CardDescription>{t("importDescription")}</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <ImportTemplateForm />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <div>
                <CardTitle>{t("overridesTitle")}</CardTitle>
                <CardDescription>{t("overridesDescription")}</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              {settings.overrides.length === 0 ? (
                <p className="text-app-body text-ink-subtle">{t("noOverrides")}</p>
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
