"use client";

import { useActionState } from "react";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/submit-button";
import { Field, FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { COUNTRIES } from "@/lib/countries";
import type { LegalOperator } from "@/lib/schemas/legal-operator";
import { saveLegalOperatorAction } from "@/server/actions/legal";

export function LegalOperatorForm({ initial }: { initial: LegalOperator }) {
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
        <Field label="Legal name" htmlFor="legalName" error={errors?.legalName} required>
          <Input id="legalName" name="legalName" defaultValue={v("legalName")} maxLength={120} />
        </Field>
        <Field label="Entity type" htmlFor="entityType" error={errors?.entityType} required>
          <Select id="entityType" name="entityType" defaultValue={v("entityType")}>
            <option value="">Choose…</option>
            <option value="INDIVIDUAL">Individual / sole proprietor</option>
            <option value="COMPANY">Company / registered entity</option>
          </Select>
        </Field>
      </FieldGroup>
      <Field
        label="Address"
        htmlFor="address"
        error={errors?.address}
        hint="Printed in the Terms and the Privacy Policy as the operator's postal address."
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
        <Field label="Country" htmlFor="country" error={errors?.country} required>
          <Select id="country" name="country" defaultValue={v("country")}>
            <option value="">Choose…</option>
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="Effective date"
          htmlFor="effectiveDate"
          error={errors?.effectiveDate}
          required
        >
          <Input
            id="effectiveDate"
            name="effectiveDate"
            type="date"
            defaultValue={v("effectiveDate")}
          />
        </Field>
        <Field label="Contact e-mail" htmlFor="contactEmail" error={errors?.contactEmail} required>
          <Input
            id="contactEmail"
            name="contactEmail"
            type="email"
            defaultValue={v("contactEmail")}
          />
        </Field>
        <Field
          label="Privacy e-mail"
          htmlFor="privacyEmail"
          error={errors?.privacyEmail}
          hint="Where data-subject requests go; may be the contact address."
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
          label="Data protection officer e-mail"
          htmlFor="dpoEmail"
          error={errors?.dpoEmail}
          hint="Only if you have appointed one."
        >
          <Input id="dpoEmail" name="dpoEmail" type="email" defaultValue={v("dpoEmail")} />
        </Field>
        <Field
          label="Governing law"
          htmlFor="governingLaw"
          error={errors?.governingLaw}
          hint='For example "the laws of India" or "the laws of England and Wales".'
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
          label="Venue for disputes"
          htmlFor="venue"
          error={errors?.venue}
          hint='For example "the courts of Bengaluru, Karnataka".'
          required
        >
          <Input id="venue" name="venue" defaultValue={v("venue")} maxLength={160} />
        </Field>
      </FieldGroup>
      <div>
        <SubmitButton pendingLabel="Saving…">Save operator details</SubmitButton>
      </div>
    </form>
  );
}
