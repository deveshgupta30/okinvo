import type { Metadata } from "next";
import { AccountForm } from "@/components/forms/account-form";
import { PageHeader } from "@/components/ui/page-header";
import { TIMEZONES } from "@/lib/timezones";
import { requireOwner } from "@/server/auth";
import { getAccount } from "@/server/dal/users";

export const metadata: Metadata = { title: "Account" };

export default async function AccountPage() {
  const actor = await requireOwner();
  const account = await getAccount(actor);
  return (
    <>
      <PageHeader title="Account" description="Your name, timezone and theme." />
      <AccountForm account={account} timezones={TIMEZONES} />
    </>
  );
}
