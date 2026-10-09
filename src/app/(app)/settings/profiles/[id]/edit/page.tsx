import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ConfirmAction } from "@/components/confirm-action";
import { ProfileForm } from "@/components/forms/profile-form";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Pill } from "@/components/ui/status-pill";
import { deleteProfileAction } from "@/server/actions/profiles";
import { requireOwner } from "@/server/auth";
import { NotFoundError } from "@/server/dal/errors";
import { getProfile } from "@/server/dal/profiles";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings.profiles.edit");
  return { title: t("metaTitle") };
}

export default async function EditProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireOwner();
  const t = await getTranslations("settings.profiles");
  const tc = await getTranslations("common");
  const { id } = await params;
  const profile = await getProfile(actor, id).catch((e: unknown) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  return (
    <>
      <PageHeader
        title={
          <>
            {profile.label}
            {profile.isDefault ? <Pill tone="success">{tc("default")}</Pill> : null}
            {profile.archivedAt ? <Pill>{tc("archived")}</Pill> : null}
          </>
        }
        breadcrumb={[{ href: "/settings/profiles", label: t("breadcrumb") }]}
        actions={
          <>
            <Button asChild variant="secondary">
              <Link href={`/settings/profiles/${profile.id}/template`}>{t("edit.template")}</Link>
            </Button>
            <ConfirmAction
              action={deleteProfileAction}
              title={t("edit.deleteTitle", { label: profile.label })}
              description={t("edit.deleteDescription")}
              confirmLabel={tc("delete")}
              hidden={{ id: profile.id }}
              trigger={tc("delete")}
              triggerVariant="tertiary"
              destructive
            />
          </>
        }
      />
      <ProfileForm profile={profile} />
    </>
  );
}
