import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ConfirmAction } from "@/components/confirm-action";
import { TemplateForm } from "@/components/templates/template-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Pill } from "@/components/ui/status-pill";
import { prisma } from "@/lib/db";
import { clearProfileTemplateAction } from "@/server/actions/templates";
import { requireOwner } from "@/server/auth";
import { NotFoundError } from "@/server/dal/errors";
import { getProfile } from "@/server/dal/profiles";
import { resolveTemplateConfig } from "@/server/dal/templates";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings.profiles.template");
  return { title: t("metaTitle") };
}

export default async function ProfileTemplatePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requireOwner();
  const t = await getTranslations("settings.profiles");
  const { id } = await params;
  const { customise } = await searchParams;
  const profile = await getProfile(actor, id).catch((e: unknown) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const instance = await resolveTemplateConfig(prisma, null);
  const editing = Boolean(profile.templateConfigOverride) || customise === "1";
  return (
    <>
      <PageHeader
        title={
          <>
            {t("template.title", { label: profile.label })}
            <Pill tone={profile.templateConfigOverride ? "success" : "neutral"}>
              {profile.templateConfigOverride
                ? t("template.ownTemplate")
                : t("template.instanceTemplate")}
            </Pill>
          </>
        }
        breadcrumb={[
          { href: "/settings/profiles", label: t("breadcrumb") },
          { href: `/settings/profiles/${id}/edit`, label: profile.label },
        ]}
        actions={
          profile.templateConfigOverride ? (
            <ConfirmAction
              action={clearProfileTemplateAction}
              title={t("template.resetTitle")}
              description={t("template.resetDescription")}
              confirmLabel={t("template.useInstance")}
              hidden={{ profileId: id }}
              trigger={t("template.useInstance")}
              triggerVariant="tertiary"
              destructive
            />
          ) : null
        }
      />
      {editing ? (
        <TemplateForm
          scope={id}
          initial={profile.templateConfigOverride ?? instance}
          cancelHref={`/settings/profiles/${id}/edit`}
        />
      ) : (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>{t("template.usingInstanceTitle")}</CardTitle>
              <CardDescription>{t("template.usingInstanceDescription")}</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Button asChild>
                <Link href={`/settings/profiles/${id}/template?customise=1`}>
                  {t("template.customise")}
                </Link>
              </Button>
              <Button asChild variant="tertiary">
                <Link href="/settings/templates">{t("template.openInstance")}</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
}
