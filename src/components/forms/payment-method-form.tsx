"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { MaskedField } from "@/components/ui/masked-field";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { COMMON_CURRENCIES, PAYMENT_METHOD_TYPES, type PaymentMethodType } from "@/lib/schemas";
import { savePaymentMethod } from "@/server/actions/payment-methods";
import type { PaymentMethodDto } from "@/server/dal/payment-methods";

const BANK_FIELDS = [
  "accountHolder",
  "accountNumber",
  "bankName",
  "branch",
  "ifsc",
  "swift",
  "iban",
  "routingCode",
] as const;

/** Identifiers a shoulder-surfer should not read off the screen (addendum §3). */
const MASKED_BANK_FIELDS: ReadonlySet<string> = new Set([
  "accountNumber",
  "ifsc",
  "swift",
  "iban",
  "routingCode",
]);

const TYPE_KEYS = {
  BANK_TRANSFER: "bankTransfer",
  UPI: "upi",
  WISE: "wise",
  REVOLUT: "revolut",
  PAYPAL: "paypal",
  CUSTOM: "custom",
} as const satisfies Record<PaymentMethodType, string>;

export function PaymentMethodForm({ method }: { method: PaymentMethodDto | null }) {
  const t = useTranslations("settings.paymentMethods.form");
  const tm = useTranslations("settings.paymentMethods");
  const tc = useTranslations("common");
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
              label={t("name")}
              htmlFor="name"
              error={errors?.name}
              hint={t("nameHint")}
              required
            >
              <Input id="name" name="name" defaultValue={v("name", method?.name)} />
            </Field>
            <Field label={t("type")} htmlFor="type" error={errors?.type} required>
              <Select
                id="type"
                name="type"
                value={type}
                onChange={(e) => setType(e.target.value as PaymentMethodType)}
              >
                {PAYMENT_METHOD_TYPES.map((pt) => (
                  <option key={pt} value={pt}>
                    {tm(`types.${TYPE_KEYS[pt]}`)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label={t("currency")}
              htmlFor="currency"
              error={errors?.currency}
              hint={t("currencyHint")}
            >
              <Select id="currency" name="currency" defaultValue={v("currency", method?.currency)}>
                <option value="">{t("anyCurrency")}</option>
                {COMMON_CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </Field>
          </FieldGroup>
          <Field
            label={t("instructions")}
            htmlFor="instructions"
            error={errors?.instructions}
            hint={t("instructionsHint")}
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
              label={t("isDefault")}
              description={t("isDefaultDescription")}
              defaultChecked={values ? values.isDefault === "on" : (method?.isDefault ?? false)}
            />
            <Checkbox
              name="isActive"
              label={t("isActive")}
              defaultChecked={values ? values.isActive === "on" : (method?.isActive ?? true)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>{t("detailsTitle")}</CardTitle>
            <CardDescription>{t("detailsDescription")}</CardDescription>
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
                label={t("vpa")}
                htmlFor="details.vpa"
                error={errors?.["details.vpa"]}
                required
              >
                <MaskedField
                  id="details.vpa"
                  name="details.vpa"
                  className="font-mono"
                  defaultValue={d("vpa")}
                />
              </Field>
              <Field
                label={t("payeeName")}
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
              label={t("lines")}
              htmlFor="details.linesText"
              error={errors?.["details.lines"]}
              hint={t("linesHint")}
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
                  label={t("accountEmail")}
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
              {BANK_FIELDS.map((key) => (
                <Field
                  key={key}
                  label={t(`bank.${key}`)}
                  htmlFor={`details.${key}`}
                  error={errors?.[`details.${key}`]}
                >
                  {MASKED_BANK_FIELDS.has(key) ? (
                    <MaskedField
                      id={`details.${key}`}
                      name={`details.${key}`}
                      className="font-mono"
                      defaultValue={d(key)}
                    />
                  ) : (
                    <Input
                      id={`details.${key}`}
                      name={`details.${key}`}
                      className="font-mono"
                      defaultValue={d(key)}
                    />
                  )}
                </Field>
              ))}
            </FieldGroup>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center gap-2">
        <SubmitButton pendingLabel={tc("saving")}>{t("save")}</SubmitButton>
        <Button asChild variant="tertiary">
          <Link href="/settings/payment-methods">{tc("cancel")}</Link>
        </Button>
      </div>
    </form>
  );
}
