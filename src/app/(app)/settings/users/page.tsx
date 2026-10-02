import type { Metadata } from "next";
import { MembersPanel } from "@/components/settings/members";
import { PageHeader } from "@/components/ui/page-header";
import { requireOwner } from "@/server/auth";
import { listMembers } from "@/server/dal/members";
import { getAccount } from "@/server/dal/users";

export const metadata: Metadata = { title: "Users" };

export default async function UsersPage() {
  const actor = await requireOwner();
  const [{ members, invitations }, account] = await Promise.all([
    listMembers(actor),
    getAccount(actor),
  ]);
  return (
    <>
      <PageHeader
        title="Users"
        description="Who can sign in to this instance and what they may do."
      />
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
