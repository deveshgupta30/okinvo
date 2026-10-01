"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { COMMON_CURRENCIES, PAYMENT_METHOD_TYPES, type PaymentMethodType } from "@/lib/schemas";
import { PAYMENT_METHOD_LABELS } from "@/lib/schemas/payment-method-input";
import { savePaymentMethod } from "@/server/actions/payment-methods";
import type { PaymentMethodDto } from "@/server/dal/payment-methods";

const BANK_FIELDS: { key: string; label: string }[] = [
  { key: "accountHolder", label: "Account holder" },
  { key: "accountNumber", label: "Account number" },
  { key: "bankName", label: "Bank name" },
  { key: "branch", label: "Branch" },
  { key: "ifsc", label: "IFSC" },
  { key: "swift", label: "SWIFT / BIC" },
  { key: "iban", label: "IBAN" },
  { key: "routingCode", label: "Routing / sort code" },
];

export function PaymentMethodForm({ method }: { method: PaymentMethodDto | null }) {
  const [state, action] = useActionState(savePaymentMethod.bind(null, method?.id ?? null), null);
  const values = state?.values;
  const errors = state?.fieldErrors;
  const [type, setType] = useState<PaymentMethodType>(
    (values?.type as PaymentMethodType | undefined) ?? method?.type ?? "BANK_TRANSFER",
  );
  const details = (method?.details ?? {}) as Record<string, unknown>;
  const d = (key: string) =>
    values?.[`details.${key}`] ??
    (typeof details[key] === "string" ? (details[key] as string) : "");
  const v = (key: string, fallback: string | null | undefined) => values?.[key] ?? fallback ?? "";
  const linesText =
    values?.["details.linesText"] ??
    (Array.isArray(details.lines) ? (details.lines as string[]).join("\n") : "");

  return (
    <form action={action} className="flex flex-col gap-6">
      <FormMessage state={state} />
      <Card>
        <CardContent>
          <FieldGroup>
            <Field
              label="Name"
              htmlFor="name"
              error={errors?.name}
              hint="Printed as the heading of the payment block"
              required
            >
              <Input id="name" name="name" defaultValue={v("name", method?.name)} />
            </Field>
            <Field label="Type" htmlFor="type" error={errors?.type} required>
              <Select
                id="type"
                name="type"
                value={type}
                onChange={(e) => setType(e.target.value as PaymentMethodType)}
              >
                {PAYMENT_METHOD_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {PAYMENT_METHOD_LABELS[t]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label="Currency"
              htmlFor="currency"
              error={errors?.currency}
              hint="Optional; shown for context only"
            >
              <Select id="currency" name="currency" defaultValue={v("currency", method?.currency)}>
                <option value="">Any</option>
                {COMMON_CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </Field>
          </FieldGroup>
          <Field
            label="Instructions"
            htmlFor="instructions"
            error={errors?.instructions}
            hint="Printed under the details"
          >
            <Textarea
              id="instructions"
              name="instructions"
              defaultValue={v("instructions", method?.instructions)}
            />
          </Field>
          <div className="flex flex-col gap-2">
            <Checkbox
              name="isDefault"
              label="Default method"
              description="Pre-selected on new invoices"
              defaultChecked={values ? values.isDefault === "on" : (method?.isDefault ?? false)}
            />
            <Checkbox
              name="isActive"
              label="Active"
              defaultChecked={values ? values.isActive === "on" : (method?.isActive ?? true)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Details</CardTitle>
            <CardDescription>
              Encrypted at rest; snapshotted into each invoice when it is issued.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {errors?.details ? (
            <p role="alert" className="text-app-caption text-semantic-danger">
              {errors.details.join(" ")}
            </p>
          ) : null}
          {type === "UPI" ? (
            <FieldGroup>
              <Field
                label="UPI ID (VPA)"
                htmlFor="details.vpa"
                error={errors?.["details.vpa"]}
                required
              >
                <Input
                  id="details.vpa"
                  name="details.vpa"
                  className="font-mono"
                  defaultValue={d("vpa")}
                />
              </Field>
              <Field
                label="Payee name"
                htmlFor="details.payeeName"
                error={errors?.["details.payeeName"]}
              >
                <Input
                  id="details.payeeName"
                  name="details.payeeName"
                  defaultValue={d("payeeName")}
                />
              </Field>
            </FieldGroup>
          ) : type === "CUSTOM" ? (
            <Field
              label="Lines"
              htmlFor="details.linesText"
              error={errors?.["details.lines"]}
              hint="One line per row, printed as-is"
              required
            >
              <Textarea
                id="details.linesText"
                name="details.linesText"
                rows={5}
                defaultValue={linesText}
              />
            </Field>
          ) : (
            <FieldGroup>
              {type !== "BANK_TRANSFER" ? (
                <Field
                  label="Account email / handle"
                  htmlFor="details.accountEmail"
                  error={errors?.["details.accountEmail"]}
                >
                  <Input
                    id="details.accountEmail"
                    name="details.accountEmail"
                    defaultValue={d("accountEmail")}
                  />
                </Field>
              ) : null}
              {BANK_FIELDS.map((f) => (
                <Field
                  key={f.key}
                  label={f.label}
                  htmlFor={`details.${f.key}`}
                  error={errors?.[`details.${f.key}`]}
                >
                  <Input
                    id={`details.${f.key}`}
                    name={`details.${f.key}`}
                    className="font-mono"
                    defaultValue={d(f.key)}
                  />
                </Field>
              ))}
            </FieldGroup>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center gap-2">
        <SubmitButton pendingLabel="Saving…">Save payment method</SubmitButton>
        <Button asChild variant="tertiary">
          <Link href="/settings/payment-methods">Cancel</Link>
        </Button>
      </div>
    </form>
  );
}
