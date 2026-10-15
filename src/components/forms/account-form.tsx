"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { Flag, hasFlag } from "@/components/flags/flag";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { saveAccount } from "@/server/actions/account";
import type { AccountDto } from "@/server/dal/users";

export interface CountryOption {
  code: string;
  name: string;
  currency: string;
}
export interface CurrencyOption {
  code: string;
  name: string;
}
export interface LanguageGroup {
  /** The region, already in the UI language. */
  label: string;
  languages: { tag: string; name: string; generated?: true }[];
}

const REPO_URL = "https://github.com/deveshgupta30/okinvo";

/**
 * Settings → Account (spec §4.3): photo and name live in their own card above; this form holds
 * the name, the sign-in e-mail (read-only), region (country + currency), language and timezone.
 */
export function AccountForm({
  account,
  timezones,
  countries,
  currencies,
  languages,
}: {
  account: AccountDto;
  timezones: readonly string[];
  countries: CountryOption[];
  currencies: CurrencyOption[];
  languages: LanguageGroup[];
}) {
  const t = useTranslations("settings.account.form");
  const tc = useTranslations("common");
  const [state, action] = useActionState(saveAccount, null);
  const errors = state?.fieldErrors;
  const [tz, setTz] = useState(state?.values?.timezone ?? account.timezone ?? "UTC");
  const [country, setCountry] = useState(state?.values?.countryCode ?? account.countryCode ?? "IN");
  const [currency, setCurrency] = useState(state?.values?.currency ?? account.currency ?? "INR");
  const [currencyTouched, setCurrencyTouched] = useState(false);
  const [locale, setLocale] = useState(state?.values?.locale ?? account.locale);
  const localeIsGenerated = languages.some((g) =>
    g.languages.some((l) => l.tag === locale && l.generated),
  );
  const suggested = countries.find((c) => c.code === country)?.currency;

  const onCountry = (code: string) => {
    setCountry(code);
    const next = countries.find((c) => c.code === code)?.currency;
    if (!currencyTouched && next) setCurrency(next);
  };

  return (
    <form action={action} className="flex flex-col gap-6">
      <FormMessage state={state} />
      <Card>
        <CardHeader>
          <div>
            <CardTitle>{t("title")}</CardTitle>
            <CardDescription>{t("description")}</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field label={t("displayName")} htmlFor="name" error={errors?.name} required>
              <Input id="name" name="name" defaultValue={state?.values?.name ?? account.name} />
            </Field>
            <Field label={t("signInEmail")} htmlFor="emailDisplay" hint={t("signInEmailHint")}>
              <Input id="emailDisplay" name="emailDisplay" value={account.email} readOnly />
            </Field>
            <Field
              label={t("timezone")}
              htmlFor="timezone"
              error={errors?.timezone}
              hint={t("timezoneHint")}
              required
            >
              <div className="flex gap-2">
                <Select
                  id="timezone"
                  name="timezone"
                  value={tz}
                  onChange={(e) => setTz(e.target.value)}
                >
                  {timezones.map((z) => (
                    <option key={z} value={z}>
                      {z}
                    </option>
                  ))}
                </Select>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setTz(Intl.DateTimeFormat().resolvedOptions().timeZone)}
                >
                  {tc("detect")}
                </Button>
              </div>
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>{t("regionTitle")}</CardTitle>
            <CardDescription>{t("regionDescription")}</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field label={t("country")} htmlFor="countryCode" error={errors?.countryCode}>
              <div className="flex items-center gap-3">
                {hasFlag(country) ? <Flag code={country} /> : null}
                <Select
                  id="countryCode"
                  name="countryCode"
                  value={country}
                  onChange={(e) => onCountry(e.target.value)}
                >
                  {countries.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </div>
            </Field>
            <Field
              label={t("currency")}
              htmlFor="currency"
              error={errors?.currency}
              hint={
                suggested && suggested !== currency ? (
                  <>
                    {t("suggested")} <span className="font-mono">{suggested}</span>
                  </>
                ) : undefined
              }
            >
              <Select
                id="currency"
                name="currency"
                value={currency}
                onChange={(e) => {
                  setCurrencyTouched(true);
                  setCurrency(e.target.value);
                }}
              >
                {currencies.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} · {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label={t("language")}
              htmlFor="locale"
              error={errors?.locale}
              hint={
                localeIsGenerated ? (
                  <span data-machine-translated>
                    {t.rich("machineTranslated", {
                      link: (chunks) => (
                        <a
                          href={`${REPO_URL}/tree/main/messages`}
                          className="text-link underline-offset-4 hover:underline"
                        >
                          {chunks}
                        </a>
                      ),
                    })}
                  </span>
                ) : (
                  t("languageHint")
                )
              }
            >
              <Select
                id="locale"
                name="locale"
                value={locale}
                onChange={(e) => setLocale(e.target.value)}
              >
                {languages.map((group) => (
                  <optgroup key={group.label} label={group.label}>
                    {group.languages.map((l) => (
                      <option key={l.tag} value={l.tag} lang={l.tag}>
                        {l.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </Select>
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>

      <div>
        <SubmitButton pendingLabel={tc("saving")}>{t("save")}</SubmitButton>
      </div>
    </form>
  );
}
