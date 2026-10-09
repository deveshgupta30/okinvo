import type { Metadata } from "next";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { ProfileForm } from "@/components/forms/profile-form";
import { PageHeader } from "@/components/ui/page-header";
import { env } from "@/lib/env";
import { profilePrefill } from "@/lib/onboarding/prefill";
import { actorFromSession } from "@/server/actor";
import { requireOwner, requireUser } from "@/server/auth";
import { getAccount } from "@/server/dal/users";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings.profiles.new");
  return { title: t("metaTitle") };
}

export default async function NewProfilePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireOwner();
  const t = await getTranslations("settings.profiles");
  const params = await searchParams;
  let prefill: Record<string, string> | undefined;
  if (params.from === "onboarding") {
    const s = await requireUser();
    const account = await getAccount(actorFromSession(s, await headers(), env.TRUST_PROXY));
    const taxId = typeof params.taxId === "string" ? params.taxId : null;
    prefill = { ...profilePrefill(account, taxId) };
  }
  return (
    <>
      <PageHeader
        title={t("new.title")}
        description={prefill ? t("new.prefilled") : undefined}
        breadcrumb={[{ href: "/settings/profiles", label: t("breadcrumb") }]}
      />
      <ProfileForm profile={null} prefill={prefill} />
    </>
  );
}
