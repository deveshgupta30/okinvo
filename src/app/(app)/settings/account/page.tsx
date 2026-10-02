import type { Metadata } from "next";
import { AvatarEditor } from "@/components/account/avatar-editor";
import { AccountForm } from "@/components/forms/account-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { APP_COOKIES } from "@/lib/cookies";
import { countryOptions } from "@/lib/geo/countries";
import { CURRENCIES, currencyName, pinnedFirst } from "@/lib/geo/currencies";
import { TIMEZONES } from "@/lib/timezones";
import { requireRole } from "@/server/auth";
import { getAccount } from "@/server/dal/users";

export const metadata: Metadata = { title: "Account" };

/** Until the localisation sub-project lands its 115-entry table, the app itself speaks English. */
const LANGUAGES = [
  { tag: "en-US", name: "English (US)", region: "Americas" },
  { tag: "en-GB", name: "English (UK)", region: "Europe" },
];

export default async function AccountPage() {
  const actor = await requireRole("VIEWER");
  const account = await getAccount(actor);
  const countries = countryOptions(["US", "GB", "IN"]);
  const currencies = pinnedFirst(CURRENCIES, ["USD", "GBP", "INR"]).map((c) => ({
    code: c.code,
    name: currencyName(c.code),
  }));
  return (
    <>
      <PageHeader title="Account" description="Your photo, name, region, language and timezone." />
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
        <AccountForm
          account={account}
          timezones={TIMEZONES}
          countries={countries}
          currencies={currencies}
          languages={LANGUAGES}
        />
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Privacy</CardTitle>
              <CardDescription>
                okinvo sets only the cookies it needs to work. No analytics, no tracking.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-2 text-app-body sm:grid-cols-[auto_1fr_auto] sm:gap-x-6">
              {APP_COOKIES.map((c) => (
                <div key={c.name} className="contents">
                  <dt className="font-mono text-app-mono text-ink">{c.name}</dt>
                  <dd className="text-ink-subtle">{c.purpose}</dd>
                  <dd className="text-app-caption text-ink-tertiary">{c.lifetime}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
