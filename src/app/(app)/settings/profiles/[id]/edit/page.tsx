import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ConfirmAction } from "@/components/confirm-action";
import { ProfileForm } from "@/components/forms/profile-form";
import { PageHeader } from "@/components/ui/page-header";
import { Pill } from "@/components/ui/status-pill";
import { deleteProfileAction } from "@/server/actions/profiles";
import { requireOwner } from "@/server/auth";
import { NotFoundError } from "@/server/dal/errors";
import { getProfile } from "@/server/dal/profiles";

export const metadata: Metadata = { title: "Edit issuer profile" };

export default async function EditProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireOwner();
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
            {profile.isDefault ? <Pill tone="success">Default</Pill> : null}
            {profile.archivedAt ? <Pill>Archived</Pill> : null}
          </>
        }
        breadcrumb={[{ href: "/settings/profiles", label: "Profiles" }]}
        actions={
          <ConfirmAction
            action={deleteProfileAction}
            title={`Delete ${profile.label}?`}
            description="Only possible while no invoice or credit note references this profile. Otherwise archive it."
            confirmLabel="Delete"
            hidden={{ id: profile.id }}
            trigger="Delete"
            triggerVariant="tertiary"
            destructive
          />
        }
      />
      <ProfileForm profile={profile} />
    </>
  );
}
