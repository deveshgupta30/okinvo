"use client";

import Link from "next/link";
import { useActionState } from "react";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { COMMON_CURRENCIES } from "@/lib/schemas";
import { UNIT_LABELS, UNIT_TYPES } from "@/lib/schemas/service-input";
import { saveService } from "@/server/actions/services";
import type { ServiceDto } from "@/server/dal/services";

export function ServiceForm({ service }: { service: ServiceDto | null }) {
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
            <Field label="Name" htmlFor="name" error={errors?.name} required>
              <Input id="name" name="name" defaultValue={v("name", service?.name)} />
            </Field>
            <Field label="Unit" htmlFor="unitType" error={errors?.unitType} required>
              <Select
                id="unitType"
                name="unitType"
                defaultValue={v("unitType", service?.unitType ?? "HOUR")}
              >
                {UNIT_TYPES.map((u) => (
                  <option key={u} value={u}>
                    {UNIT_LABELS[u]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Default rate" htmlFor="defaultRate" error={errors?.defaultRate} required>
              <Input
                id="defaultRate"
                name="defaultRate"
                type="number"
                step="0.01"
                min="0"
                defaultValue={v("defaultRate", service?.defaultRate)}
              />
            </Field>
            <Field label="Currency" htmlFor="currency" error={errors?.currency} required>
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
              label="SAC / HSN code"
              htmlFor="sacHsnCode"
              error={errors?.sacHsnCode}
              hint="Required on GST invoices"
            >
              <Input
                id="sacHsnCode"
                name="sacHsnCode"
                className="font-mono"
                defaultValue={v("sacHsnCode", service?.sacHsnCode)}
              />
            </Field>
            <Field
              label="Default tax rate (%)"
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
            label="Description"
            htmlFor="description"
            error={errors?.description}
            hint="Pre-fills the line description"
          >
            <Textarea
              id="description"
              name="description"
              defaultValue={v("description", service?.description)}
            />
          </Field>
          <Checkbox
            name="isActive"
            label="Active"
            description="Inactive services stay out of the invoice picker"
            defaultChecked={values ? values.isActive === "on" : (service?.isActive ?? true)}
          />
        </CardContent>
      </Card>
      <div className="flex items-center gap-2">
        <SubmitButton pendingLabel="Saving…">Save service</SubmitButton>
        <Button asChild variant="tertiary">
          <Link href="/services">Cancel</Link>
        </Button>
      </div>
    </form>
  );
}
