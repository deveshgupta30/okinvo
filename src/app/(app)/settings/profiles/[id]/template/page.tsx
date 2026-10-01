import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
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

export const metadata: Metadata = { title: "Profile template" };

export default async function ProfileTemplatePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requireOwner();
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
            Template for {profile.label}
            <Pill tone={profile.templateConfigOverride ? "success" : "neutral"}>
              {profile.templateConfigOverride ? "Own template" : "Instance template"}
            </Pill>
          </>
        }
        breadcrumb={[
          { href: "/settings/profiles", label: "Profiles" },
          { href: `/settings/profiles/${id}/edit`, label: profile.label },
        ]}
        actions={
          profile.templateConfigOverride ? (
            <ConfirmAction
              action={clearProfileTemplateAction}
              title="Use the instance template again?"
              description="This profile's own configuration is removed; issued documents are unaffected."
              confirmLabel="Use instance template"
              hidden={{ profileId: id }}
              trigger="Use instance template"
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
              <CardTitle>Using the instance template</CardTitle>
              <CardDescription>
                Documents from this profile follow Settings → Templates. Opt in to customise them
                separately.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Button asChild>
                <Link href={`/settings/profiles/${id}/template?customise=1`}>
                  Use a different template for this profile
                </Link>
              </Button>
              <Button asChild variant="tertiary">
                <Link href="/settings/templates">Open instance template</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
}
