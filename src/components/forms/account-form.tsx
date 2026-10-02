"use client";

import { useActionState, useState } from "react";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { saveAccount } from "@/server/actions/account";
import type { AccountDto } from "@/server/dal/users";

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
        </CardContent>
      </Card>
      <div>
        <SubmitButton pendingLabel="Saving…">Save preferences</SubmitButton>
      </div>
    </form>
  );
}
