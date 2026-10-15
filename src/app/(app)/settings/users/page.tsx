import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { MembersPanel } from "@/components/settings/members";
import { PageHeader } from "@/components/ui/page-header";
import { requireOwner } from "@/server/auth";
import { listMembers } from "@/server/dal/members";
import { getAccount } from "@/server/dal/users";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings.users");
  return { title: t("metaTitle") };
}

export default async function UsersPage() {
  const actor = await requireOwner();
  const t = await getTranslations("settings.users");
  const [{ members, invitations }, account] = await Promise.all([
    listMembers(actor),
    getAccount(actor),
  ]);
  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <MembersPanel
        members={members}
        invitations={invitations}
        selfId={actor.userId}
        locale={account.locale}
        timeZone={actor.timezone}
      />
    </>
  );
}
