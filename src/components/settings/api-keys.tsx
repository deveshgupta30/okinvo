"use client";

import { Check, Copy } from "lucide-react";
import { useTranslations } from "next-intl";
import * as React from "react";
import { useActionState } from "react";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { Scope } from "@/lib/api/scopes";
import { createApiKeyAction } from "@/server/actions/api-keys";

/** Scope id (data, shown as the description) to the catalogue key of its label under `scopes`. */
const SCOPE_KEYS = {
  "invoices:read": "invoicesRead",
  "invoices:create": "invoicesCreate",
  "credit_notes:read": "creditNotesRead",
  "credit_notes:create": "creditNotesCreate",
  "catalogue:read": "catalogueRead",
  "documents:read": "documentsRead",
  "status:read": "statusRead",
} as const satisfies Record<Scope, string>;

function CopyKey({ value }: { value: string }) {
  const t = useTranslations("settings.api.form");
  const tc = useTranslations("common");
  const [done, setDone] = React.useState(false);
  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      aria-label={t("copyKey")}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          // clipboard unavailable: the key is selectable
        }
      }}
    >
      {done ? (
        <Check className="size-3.5" strokeWidth={1.5} />
      ) : (
        <Copy className="size-3.5" strokeWidth={1.5} />
      )}
      {done ? tc("copied") : tc("copy")}
    </Button>
  );
}

/** Create form with scope checkboxes limited to the role's ceiling; the key is revealed once. */
export function CreateApiKeyForm({ allowed }: { allowed: Scope[] }) {
  const t = useTranslations("settings.api");
  const [state, action] = useActionState(createApiKeyAction, null);
  const errors = state && !state.ok ? state.fieldErrors : undefined;
  return (
    <div className="flex flex-col gap-4">
      {state?.ok ? (
        <div
          data-api-key-created
          className="flex flex-col gap-2 rounded-md border border-semantic-success/40 bg-surface-1 p-3"
        >
          <p role="status" className="text-app-body text-semantic-success">
            {state.message}
          </p>
          <div className="flex items-center justify-between gap-2">
            <code data-api-key className="app-mono text-app-caption break-all text-ink select-all">
              {state.created.key}
            </code>
            <CopyKey value={state.created.key} />
          </div>
        </div>
      ) : null}
      <form action={action} className="flex flex-col gap-4">
        <FormMessage state={state && !state.ok ? state : null} />
        <FieldGroup>
          <Field label={t("form.name")} htmlFor="api-key-name" error={errors?.name} required>
            <Input
              id="api-key-name"
              name="name"
              maxLength={60}
              placeholder={t("form.namePlaceholder")}
            />
          </Field>
          <Field label={t("form.expires")} htmlFor="api-key-expires">
            <Select id="api-key-expires" name="expires" defaultValue="90">
              <option value="30">{t("form.in30Days")}</option>
              <option value="90">{t("form.in90Days")}</option>
              <option value="365">{t("form.inAYear")}</option>
              <option value="never">{t("form.never")}</option>
            </Select>
          </Field>
        </FieldGroup>
        <fieldset className="flex flex-col gap-2" aria-label={t("form.scopes")}>
          <legend className="mb-1 text-app-label text-ink-subtle">{t("form.scopes")}</legend>
          {errors?.scopes ? (
            <p role="alert" className="text-app-caption text-semantic-danger">
              {errors.scopes.join(" ")}
            </p>
          ) : null}
          {allowed.map((s) => (
            <Checkbox
              key={s}
              name="scopes"
              value={s}
              label={t(`scopes.${SCOPE_KEYS[s]}`)}
              description={s}
              defaultChecked={s.endsWith(":read")}
            />
          ))}
        </fieldset>
        <div>
          <SubmitButton pendingLabel={t("form.creating")}>{t("form.submit")}</SubmitButton>
        </div>
      </form>
    </div>
  );
}
