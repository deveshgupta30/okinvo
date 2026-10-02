import type { Metadata } from "next";
import { AvatarEditor } from "@/components/account/avatar-editor";
import { AccountForm } from "@/components/forms/account-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
      <PageHeader title="Account" description="Your photo, name, timezone and theme." />
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Photo</CardTitle>
              <CardDescription>Shown in the sidebar and the user menu.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <AvatarEditor name={account.name} email={account.email} avatarKey={account.avatarKey} />
          </CardContent>
        </Card>
        <AccountForm account={account} timezones={TIMEZONES} />
      </div>
    </>
  );
}
