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
import { saveProduct } from "@/server/actions/products";
import type { ProductDto } from "@/server/dal/products";

/** Issuer profiles this item is offered to (spec §5.2). No tick = offered to every profile. */
export function ProfileTags({
  profiles,
  selected,
}: {
  profiles: { id: string; label: string }[];
  selected: readonly string[];
}) {
  if (profiles.length < 2) return null;
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-app-label text-ink-subtle">Profiles</legend>
      <p className="text-app-caption text-ink-subtle">
        Tick the issuer profiles that sell this. Leave all unticked to offer it to every profile.
      </p>
      {profiles.map((p) => (
        <Checkbox
          key={p.id}
          name="issuerProfileIds"
          value={p.id}
          label={p.label}
          defaultChecked={selected.includes(p.id)}
        />
      ))}
    </fieldset>
  );
}

export function ProductForm({
  product,
  profiles = [],
}: {
  product: ProductDto | null;
  profiles?: { id: string; label: string }[] | undefined;
}) {
  const [state, action] = useActionState(saveProduct.bind(null, product?.id ?? null), null);
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
            <Field
              label="SKU"
              htmlFor="sku"
              error={errors?.sku}
              hint="Unique code printed under the line description"
              required
            >
              <Input
                id="sku"
                name="sku"
                className="font-mono uppercase"
                defaultValue={v("sku", product?.sku)}
              />
            </Field>
            <Field label="Name" htmlFor="name" error={errors?.name} required>
              <Input id="name" name="name" defaultValue={v("name", product?.name)} />
            </Field>
            <Field label="Unit" htmlFor="unitType" error={errors?.unitType} required>
              <Select
                id="unitType"
                name="unitType"
                defaultValue={v("unitType", product?.unitType ?? "UNIT")}
              >
                {UNIT_TYPES.map((u) => (
                  <option key={u} value={u}>
                    {UNIT_LABELS[u]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Unit price" htmlFor="unitPrice" error={errors?.unitPrice} required>
              <Input
                id="unitPrice"
                name="unitPrice"
                type="number"
                step="0.01"
                min="0"
                defaultValue={v("unitPrice", product?.unitPrice)}
              />
            </Field>
            <Field label="Currency" htmlFor="currency" error={errors?.currency} required>
              <Select
                id="currency"
                name="currency"
                defaultValue={v("currency", product?.currency ?? "INR")}
              >
                {COMMON_CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label="HSN code"
              htmlFor="hsnCode"
              error={errors?.hsnCode}
              hint="Required on GST invoices for goods"
            >
              <Input
                id="hsnCode"
                name="hsnCode"
                className="font-mono"
                defaultValue={v("hsnCode", product?.hsnCode)}
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
                defaultValue={v("defaultTaxRate", product?.defaultTaxRate ?? "18")}
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
              defaultValue={v("description", product?.description)}
            />
          </Field>
          <ProfileTags
            profiles={profiles}
            selected={
              values
                ? (values.issuerProfileIds ?? "").split(",").filter(Boolean)
                : (product?.issuerProfileIds ?? [])
            }
          />
          <Checkbox
            name="isActive"
            label="Active"
            description="Inactive products stay out of the invoice picker"
            defaultChecked={values ? values.isActive === "on" : (product?.isActive ?? true)}
          />
        </CardContent>
      </Card>
      <div className="flex items-center gap-2">
        <SubmitButton pendingLabel="Saving…">Save product</SubmitButton>
        <Button asChild variant="tertiary">
          <Link href="/products">Cancel</Link>
        </Button>
      </div>
    </form>
  );
}
