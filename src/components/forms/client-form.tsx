"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { AddressFields } from "@/components/forms/address-fields";
import { CountryStateFields } from "@/components/forms/country-state-fields";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { LANGUAGES } from "@/lib/i18n/languages";
import { COMMON_CURRENCIES, TAX_ID_TYPES } from "@/lib/schemas";
import { saveClient } from "@/server/actions/clients";
import type { ClientDto } from "@/server/dal/clients";

export function ClientForm({ client }: { client: ClientDto | null }) {
  const t = useTranslations("clients.form");
  const tc = useTranslations("common");
  const [state, action] = useActionState(saveClient.bind(null, client?.id ?? null), null);
  const [shipping, setShipping] = useState(
    state?.values ? state.values.hasShippingAddress === "on" : Boolean(client?.shippingAddress),
  );
  const values = state?.values;
  const errors = state?.fieldErrors;
  const v = (key: string, fallback: string | number | null | undefined) =>
    values?.[key] ?? (fallback == null ? "" : String(fallback));

  return (
    <form action={action} className="flex flex-col gap-6">
      <FormMessage state={state} />
      <Card>
        <CardHeader>
          <CardTitle>{t("cardTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field
              label={t("displayName")}
              htmlFor="displayName"
              error={errors?.displayName}
              required
            >
              <Input
                id="displayName"
                name="displayName"
                defaultValue={v("displayName", client?.displayName)}
              />
            </Field>
            <Field label={t("contactPerson")} htmlFor="contactPerson" error={errors?.contactPerson}>
              <Input
                id="contactPerson"
                name="contactPerson"
                defaultValue={v("contactPerson", client?.contactPerson)}
              />
            </Field>
            <Field label={t("email")} htmlFor="email" error={errors?.email}>
              <Input
                id="email"
                name="email"
                type="email"
                defaultValue={v("email", client?.email)}
              />
            </Field>
            <Field label={t("phone")} htmlFor="phone" error={errors?.phone}>
              <Input id="phone" name="phone" defaultValue={v("phone", client?.phone)} />
            </Field>
            <CountryStateFields
              country={v("countryCode", client?.countryCode ?? "IN")}
              state={v("stateCode", client?.stateCode)}
              gstStateCode={v("gstStateCode", client?.gstStateCode)}
              errors={errors}
            />
            <Field label={t("taxIdType")} htmlFor="taxIdType" error={errors?.taxIdType}>
              <Select
                id="taxIdType"
                name="taxIdType"
                defaultValue={v("taxIdType", client?.taxIdType)}
              >
                <option value="">{t("taxIdTypeNone")}</option>
                {TAX_ID_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t("taxId")} htmlFor="taxId" error={errors?.taxId}>
              <Input
                id="taxId"
                name="taxId"
                className="font-mono uppercase"
                defaultValue={v("taxId", client?.taxId)}
              />
            </Field>
            <Field label={t("currency")} htmlFor="currency" error={errors?.currency} required>
              <Select
                id="currency"
                name="currency"
                defaultValue={v("currency", client?.currency ?? "INR")}
              >
                {COMMON_CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label={t("preferredLanguage")}
              htmlFor="preferredLocale"
              error={errors?.preferredLocale}
            >
              <Select
                id="preferredLocale"
                name="preferredLocale"
                defaultValue={v("preferredLocale", client?.preferredLocale)}
              >
                <option value="">{t("preferredLanguageFollow")}</option>
                {LANGUAGES.map((l) => (
                  <option key={l.tag} value={l.tag} lang={l.tag}>
                    {l.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label={t("paymentTerms")}
              htmlFor="paymentTermsDays"
              error={errors?.paymentTermsDays}
              required
            >
              <Input
                id="paymentTermsDays"
                name="paymentTermsDays"
                type="number"
                min="0"
                max="365"
                defaultValue={v("paymentTermsDays", client?.paymentTermsDays ?? 30)}
              />
            </Field>
            <Field
              label={t("expectedTdsRate")}
              htmlFor="defaultTdsRate"
              error={errors?.defaultTdsRate}
            >
              <Input
                id="defaultTdsRate"
                name="defaultTdsRate"
                type="number"
                step="0.01"
                min="0"
                max="100"
                defaultValue={v("defaultTdsRate", client?.defaultTdsRate)}
              />
            </Field>
          </FieldGroup>
          <Field label={t("notes")} htmlFor="notes" error={errors?.notes}>
            <Textarea id="notes" name="notes" defaultValue={v("notes", client?.notes)} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("billingAddress")}</CardTitle>
        </CardHeader>
        <CardContent>
          <AddressFields
            prefix="billingAddress"
            defaults={client?.billingAddress}
            values={values}
            errors={errors}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("shippingAddress")}</CardTitle>
          <Checkbox
            name="hasShippingAddress"
            label={t("differentFromBilling")}
            checked={shipping}
            onChange={(e) => setShipping(e.target.checked)}
          />
        </CardHeader>
        {shipping ? (
          <CardContent>
            <AddressFields
              prefix="shippingAddress"
              defaults={client?.shippingAddress}
              values={values}
              errors={errors}
            />
          </CardContent>
        ) : null}
      </Card>

      <div className="flex items-center gap-2">
        <SubmitButton pendingLabel={tc("saving")}>{t("save")}</SubmitButton>
        <Button asChild variant="tertiary">
          <Link href={client ? `/clients/${client.id}` : "/clients"}>{tc("cancel")}</Link>
        </Button>
      </div>
    </form>
  );
}
