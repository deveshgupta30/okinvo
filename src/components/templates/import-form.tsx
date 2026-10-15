"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/submit-button";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { importTemplateAction } from "@/server/actions/templates";

export function ImportTemplateForm() {
  const t = useTranslations("settings.templates.import");
  const [state, action] = useActionState(importTemplateAction, null);
  return (
    <form action={action} className="flex flex-col gap-3">
      <FormMessage state={state} />
      <Field
        label={t("json")}
        htmlFor="json"
        error={state && !state.ok ? state.fieldErrors.json : undefined}
        hint={t("jsonHint")}
      >
        <Textarea
          id="json"
          name="json"
          rows={6}
          className="font-mono"
          defaultValue={state?.values?.json ?? ""}
        />
      </Field>
      <div>
        <SubmitButton variant="secondary" pendingLabel={t("importing")}>
          {t("submit")}
        </SubmitButton>
      </div>
    </form>
  );
}
