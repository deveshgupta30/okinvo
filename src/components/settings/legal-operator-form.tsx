"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/submit-button";
import { Field, FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { DateField } from "@/components/ui/date-field";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { COUNTRIES } from "@/lib/countries";
import type { LegalOperator } from "@/lib/schemas/legal-operator";
import { saveLegalOperatorAction } from "@/server/actions/legal";

export function LegalOperatorForm({ initial }: { initial: LegalOperator }) {
  const t = useTranslations("settings.legal.form");
  const tc = useTranslations("common");
  const [state, action] = useActionState(saveLegalOperatorAction, null);
  const errors = state && !state.ok ? state.fieldErrors : undefined;
  const v = (key: keyof LegalOperator) =>
    (state && !state.ok ? state.values?.[key] : undefined) ?? initial[key] ?? "";
  return (
    <form action={action} className="flex flex-col gap-4">
      <FormMessage state={state && !state.ok ? state : null} />
      {state?.ok ? (
        <p role="status" className="text-app-body text-semantic-success">
          {state.message}
        </p>
      ) : null}
      <FieldGroup>
        <Field label={t("legalName")} htmlFor="legalName" error={errors?.legalName} required>
          <Input id="legalName" name="legalName" defaultValue={v("legalName")} maxLength={120} />
        </Field>
        <Field label={t("entityType")} htmlFor="entityType" error={errors?.entityType} required>
          <Select id="entityType" name="entityType" defaultValue={v("entityType")}>
            <option value="">{tc("choose")}</option>
            <option value="INDIVIDUAL">{t("individual")}</option>
            <option value="COMPANY">{t("company")}</option>
          </Select>
        </Field>
      </FieldGroup>
      <Field
        label={t("address")}
        htmlFor="address"
        error={errors?.address}
        hint={t("addressHint")}
        required
      >
        <Textarea
          id="address"
          name="address"
          rows={3}
          defaultValue={v("address")}
          maxLength={400}
        />
      </Field>
      <FieldGroup>
        <Field label={t("country")} htmlFor="country" error={errors?.country} required>
          <Select id="country" name="country" defaultValue={v("country")}>
            <option value="">{tc("choose")}</option>
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label={t("effectiveDate")}
          htmlFor="effectiveDate"
          error={errors?.effectiveDate}
          required
        >
          <DateField id="effectiveDate" name="effectiveDate" defaultValue={v("effectiveDate")} />
        </Field>
        <Field
          label={t("contactEmail")}
          htmlFor="contactEmail"
          error={errors?.contactEmail}
          required
        >
          <Input
            id="contactEmail"
            name="contactEmail"
            type="email"
            defaultValue={v("contactEmail")}
          />
        </Field>
        <Field
          label={t("privacyEmail")}
          htmlFor="privacyEmail"
          error={errors?.privacyEmail}
          hint={t("privacyEmailHint")}
          required
        >
          <Input
            id="privacyEmail"
            name="privacyEmail"
            type="email"
            defaultValue={v("privacyEmail")}
          />
        </Field>
        <Field
          label={t("dpoEmail")}
          htmlFor="dpoEmail"
          error={errors?.dpoEmail}
          hint={t("dpoEmailHint")}
        >
          <Input id="dpoEmail" name="dpoEmail" type="email" defaultValue={v("dpoEmail")} />
        </Field>
        <Field
          label={t("governingLaw")}
          htmlFor="governingLaw"
          error={errors?.governingLaw}
          hint={t("governingLawHint")}
          required
        >
          <Input
            id="governingLaw"
            name="governingLaw"
            defaultValue={v("governingLaw")}
            maxLength={120}
          />
        </Field>
        <Field
          label={t("venue")}
          htmlFor="venue"
          error={errors?.venue}
          hint={t("venueHint")}
          required
        >
          <Input id="venue" name="venue" defaultValue={v("venue")} maxLength={160} />
        </Field>
      </FieldGroup>
      <div>
        <SubmitButton pendingLabel={tc("saving")}>{t("submit")}</SubmitButton>
      </div>
    </form>
  );
}
