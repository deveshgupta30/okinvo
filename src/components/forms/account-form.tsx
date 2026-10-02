"use client";

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
export interface LanguageOption {
  tag: string;
  name: string;
  region: string;
}

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
  languages: LanguageOption[];
}) {
  const [state, action] = useActionState(saveAccount, null);
  const errors = state?.fieldErrors;
  const [tz, setTz] = useState(state?.values?.timezone ?? account.timezone ?? "UTC");
  const [country, setCountry] = useState(state?.values?.countryCode ?? account.countryCode ?? "IN");
  const [currency, setCurrency] = useState(state?.values?.currency ?? account.currency ?? "INR");
  const [currencyTouched, setCurrencyTouched] = useState(false);
  const suggested = countries.find((c) => c.code === country)?.currency;

  const onCountry = (code: string) => {
    setCountry(code);
    const next = countries.find((c) => c.code === code)?.currency;
    if (!currencyTouched && next) setCurrency(next);
  };

  const regions = [...new Set(languages.map((l) => l.region))];

  return (
    <form action={action} className="flex flex-col gap-6">
      <FormMessage state={state} />
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Account</CardTitle>
            <CardDescription>How you appear and when “today” is.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field label="Display name" htmlFor="name" error={errors?.name} required>
              <Input id="name" name="name" defaultValue={state?.values?.name ?? account.name} />
            </Field>
            <Field
              label="Sign-in email"
              htmlFor="emailDisplay"
              hint="Your identity on this instance; it cannot be edited here."
            >
              <Input id="emailDisplay" name="emailDisplay" value={account.email} readOnly />
            </Field>
            <Field
              label="Timezone"
              htmlFor="timezone"
              error={errors?.timezone}
              hint="“Today” for issue dates, due dates and the dashboard"
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
                  Detect
                </Button>
              </div>
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Region</CardTitle>
            <CardDescription>
              Defaults for new issuer profiles and for the dashboard until a profile exists.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field label="Country" htmlFor="countryCode" error={errors?.countryCode}>
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
              label="Currency"
              htmlFor="currency"
              error={errors?.currency}
              hint={
                suggested && suggested !== currency ? (
                  <>
                    Suggested for this country: <span className="font-mono">{suggested}</span>
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
              label="Language"
              htmlFor="locale"
              error={errors?.locale}
              hint="The language of the app itself. Documents use each profile's own locale."
            >
              <Select
                id="locale"
                name="locale"
                defaultValue={state?.values?.locale ?? account.locale}
              >
                {regions.map((region) => (
                  <optgroup key={region} label={region}>
                    {languages
                      .filter((l) => l.region === region)
                      .map((l) => (
                        <option key={l.tag} value={l.tag}>
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
        <SubmitButton pendingLabel="Saving…">Save preferences</SubmitButton>
      </div>
    </form>
  );
}
