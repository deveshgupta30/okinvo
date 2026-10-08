import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AvatarEditor } from "@/components/account/avatar-editor";
import { AccountForm, type LanguageGroup } from "@/components/forms/account-form";
import { ShowCookieNoticeAgain } from "@/components/settings/show-cookie-notice";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { APP_COOKIES } from "@/lib/cookies";
import { countryOptions } from "@/lib/geo/countries";
import { CURRENCIES, currencyName, pinnedFirst } from "@/lib/geo/currencies";
import { languagesByRegion, type Region } from "@/lib/i18n/languages";
import { TIMEZONES } from "@/lib/timezones";
import { requireRole } from "@/server/auth";
import { getAccount } from "@/server/dal/users";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings.account");
  return { title: t("metaTitle") };
}

const REGION_KEY = {
  Africa: "Africa",
  Americas: "Americas",
  Asia: "Asia",
  Europe: "Europe",
  "Middle East": "MiddleEast",
  Oceania: "Oceania",
  Constructed: "Constructed",
} as const satisfies Record<Region, string>;

export default async function AccountPage() {
  const actor = await requireRole("VIEWER");
  const [account, t] = await Promise.all([getAccount(actor), getTranslations("settings.account")]);
  const countries = countryOptions(["US", "GB", "IN"]);
  const currencies = pinnedFirst(CURRENCIES, ["USD", "GBP", "INR"]).map((c) => ({
    code: c.code,
    name: currencyName(c.code),
  }));
  // The picker groups the table by region and shows every language in its own name (spec §8.1).
  const languages: LanguageGroup[] = languagesByRegion().map((g) => ({
    label: t(`regions.${REGION_KEY[g.region]}`),
    languages: g.languages.map((l) => ({ tag: l.tag, name: l.name })),
  }));
  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>{t("photo.title")}</CardTitle>
              <CardDescription>{t("photo.description")}</CardDescription>
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
          languages={languages}
        />
        <Card>
          <CardHeader>
            <div>
              <CardTitle>{t("privacy.title")}</CardTitle>
              <CardDescription>{t("privacy.description")}</CardDescription>
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
            <div className="mt-3 flex flex-wrap items-center gap-3 text-app-caption">
              <a href="/legal/cookies" className="text-link underline-offset-4 hover:underline">
                {t("privacy.cookiePolicy")}
              </a>
              <ShowCookieNoticeAgain />
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
