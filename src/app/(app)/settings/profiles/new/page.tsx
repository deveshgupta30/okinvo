import type { Metadata } from "next";
import { ProfileForm } from "@/components/forms/profile-form";
import { PageHeader } from "@/components/ui/page-header";
import { requireOwner } from "@/server/auth";

export const metadata: Metadata = { title: "New issuer profile" };

export default async function NewProfilePage() {
  await requireOwner();
  return (
    <>
      <PageHeader
        title="New issuer profile"
        breadcrumb={[{ href: "/settings/profiles", label: "Profiles" }]}
      />
      <ProfileForm profile={null} />
    </>
  );
}
