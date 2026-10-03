"use client";

import { Check, Copy } from "lucide-react";
import * as React from "react";
import { useActionState } from "react";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SCOPE_LABELS, type Scope } from "@/lib/api/scopes";
import { createApiKeyAction } from "@/server/actions/api-keys";

function CopyKey({ value }: { value: string }) {
  const [done, setDone] = React.useState(false);
  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      aria-label="Copy API key"
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
      {done ? "Copied" : "Copy"}
    </Button>
  );
}

/** Create form with scope checkboxes limited to the role's ceiling; the key is revealed once. */
export function CreateApiKeyForm({ allowed }: { allowed: Scope[] }) {
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
          <Field label="Name" htmlFor="api-key-name" error={errors?.name} required>
            <Input
              id="api-key-name"
              name="name"
              maxLength={60}
              placeholder="e.g. accounting script"
            />
          </Field>
          <Field label="Expires" htmlFor="api-key-expires">
            <Select id="api-key-expires" name="expires" defaultValue="90">
              <option value="30">In 30 days</option>
              <option value="90">In 90 days</option>
              <option value="365">In a year</option>
              <option value="never">Never</option>
            </Select>
          </Field>
        </FieldGroup>
        <fieldset className="flex flex-col gap-2" aria-label="Scopes">
          <legend className="mb-1 text-app-label text-ink-subtle">Scopes</legend>
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
              label={SCOPE_LABELS[s]}
              description={s}
              defaultChecked={s.endsWith(":read")}
            />
          ))}
        </fieldset>
        <div>
          <SubmitButton pendingLabel="Creating…">Create API key</SubmitButton>
        </div>
      </form>
    </div>
  );
}
