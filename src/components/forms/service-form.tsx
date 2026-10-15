"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { MultiSelectField } from "@/components/ui/multi-select-field";
import { Field, FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { COMMON_CURRENCIES } from "@/lib/schemas";
import { UNIT_TYPES } from "@/lib/schemas/service-input";
import { saveService } from "@/server/actions/services";
import type { ServiceDto } from "@/server/dal/services";

/** Issuer profiles this item is offered to (spec §5.2). No tick = offered to every profile. */
export function ProfileTags({
  profiles,
  selected,
}: {
  profiles: { id: string; label: string }[];
  selected: readonly string[];
}) {
  const t = useTranslations("catalogue.tags");
  if (profiles.length < 2) return null;
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-app-label text-ink-subtle">{t("legend")}</legend>
      <p className="text-app-caption text-ink-subtle">{t("hint")}</p>
      <MultiSelectField
        name="issuerProfileIds"
        label={t("legend")}
        options={profiles.map((p) => ({ value: p.id, label: p.label }))}
        defaultValue={selected}
      />
    </fieldset>
  );
}

export function ServiceForm({
  service,
  profiles = [],
}: {
  service: ServiceDto | null;
  profiles?: { id: string; label: string }[] | undefined;
}) {
  const t = useTranslations("catalogue");
  const tc = useTranslations("common");
  const [state, action] = useActionState(saveService.bind(null, service?.id ?? null), null);
  const values = state?.values;
  const errors = state?.fieldErrors;
  const v = (key: string, fallback: string | number | null | undefined) =>
    values?.[key] ?? (fallback == null ? "" : String(fallback));
  return (
    <form action={action} className="flex flex-col gap-6">
      <FormMessage state={state} />
      <Card>
        <CardContent>
          <FieldGroup>
            <Field label={t("forms.name")} htmlFor="name" error={errors?.name} required>
              <Input id="name" name="name" defaultValue={v("name", service?.name)} />
            </Field>
            <Field label={t("forms.unit")} htmlFor="unitType" error={errors?.unitType} required>
              <Select
                id="unitType"
                name="unitType"
                defaultValue={v("unitType", service?.unitType ?? "HOUR")}
              >
                {UNIT_TYPES.map((u) => (
                  <option key={u} value={u}>
                    {t(`units.${u}`)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label={t("forms.defaultRate")}
              htmlFor="defaultRate"
              error={errors?.defaultRate}
              required
            >
              <Input
                id="defaultRate"
                name="defaultRate"
                type="number"
                step="0.01"
                min="0"
                defaultValue={v("defaultRate", service?.defaultRate)}
              />
            </Field>
            <Field label={t("forms.currency")} htmlFor="currency" error={errors?.currency} required>
              <Select
                id="currency"
                name="currency"
                defaultValue={v("currency", service?.currency ?? "INR")}
              >
                {COMMON_CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label={t("forms.sacHsnCode")}
              htmlFor="sacHsnCode"
              error={errors?.sacHsnCode}
              hint={t("forms.sacHsnHint")}
            >
              <Input
                id="sacHsnCode"
                name="sacHsnCode"
                className="font-mono"
                defaultValue={v("sacHsnCode", service?.sacHsnCode)}
              />
            </Field>
            <Field
              label={t("forms.defaultTaxRate")}
              htmlFor="defaultTaxRate"
              error={errors?.defaultTaxRate}
              required
            >
              <Input
                id="defaultTaxRate"
                name="defaultTaxRate"
                type="number"
                step="0.01"
                min="0"
                max="100"
                defaultValue={v("defaultTaxRate", service?.defaultTaxRate ?? "18")}
              />
            </Field>
          </FieldGroup>
          <Field
            label={t("forms.description")}
            htmlFor="description"
            error={errors?.description}
            hint={t("forms.descriptionHint")}
          >
            <Textarea
              id="description"
              name="description"
              defaultValue={v("description", service?.description)}
            />
          </Field>
          <ProfileTags
            profiles={profiles}
            selected={
              values
                ? (values.issuerProfileIds ?? "").split(",").filter(Boolean)
                : (service?.issuerProfileIds ?? [])
            }
          />
          <Checkbox
            name="isActive"
            label={t("forms.active")}
            description={t("forms.serviceInactiveHint")}
            defaultChecked={values ? values.isActive === "on" : (service?.isActive ?? true)}
          />
        </CardContent>
      </Card>
      <div className="flex items-center gap-2">
        <SubmitButton pendingLabel={tc("saving")}>{t("forms.saveService")}</SubmitButton>
        <Button asChild variant="tertiary">
          <Link href="/services">{tc("cancel")}</Link>
        </Button>
      </div>
    </form>
  );
}
