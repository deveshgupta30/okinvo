"use client";

import { useActionState, useState } from "react";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { THEME_MODES } from "@/lib/schemas/account-input";
import type { ThemeMode } from "@/lib/theme";
import { saveAccount } from "@/server/actions/account";
import type { AccountDto } from "@/server/dal/users";

const THEME_LABELS: Record<ThemeMode, string> = {
  system: "Follow the system",
  light: "Light",
  dark: "Dark",
};

export function AccountForm({
  account,
  timezones,
}: {
  account: AccountDto;
  timezones: readonly string[];
}) {
  const [state, action] = useActionState(saveAccount, null);
  const [tz, setTz] = useState(state?.values?.timezone ?? account.timezone ?? "UTC");
  const errors = state?.fieldErrors;
  return (
    <form action={action} className="flex flex-col gap-6">
      <FormMessage state={state} />
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Account</CardTitle>
            <CardDescription>{account.email}</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field label="Display name" htmlFor="name" error={errors?.name} required>
              <Input id="name" name="name" defaultValue={state?.values?.name ?? account.name} />
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
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-app-label text-ink-subtle">Theme</legend>
            {THEME_MODES.map((mode) => (
              <label
                key={mode}
                className="flex cursor-pointer items-center gap-2 text-app-body text-ink"
              >
                <input
                  type="radio"
                  name="theme"
                  value={mode}
                  defaultChecked={(state?.values?.theme ?? account.theme) === mode}
                  className="size-4 accent-primary"
                />
                {THEME_LABELS[mode]}
              </label>
            ))}
            {errors?.theme ? (
              <p role="alert" className="text-app-caption text-semantic-danger">
                {errors.theme.join(" ")}
              </p>
            ) : null}
          </fieldset>
        </CardContent>
      </Card>
      <div>
        <SubmitButton pendingLabel="Saving…">Save preferences</SubmitButton>
      </div>
    </form>
  );
}
