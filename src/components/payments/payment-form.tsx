"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { ReceiptsField } from "@/components/payments/receipts-field";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { DateField } from "@/components/ui/date-field";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { COMMON_CURRENCIES } from "@/lib/schemas";
import { savePayment } from "@/server/actions/payments";
import type { PaymentMethodDto } from "@/server/dal/payment-methods";
import type { PaymentDto, PaymentKind } from "@/server/dal/payments";

const KINDS: PaymentKind[] = ["PAYMENT", "REFUND", "WRITE_OFF"];

export function PaymentForm({
  invoiceId,
  currency,
  today,
  methods,
  payment,
}: {
  invoiceId: string;
  currency: string;
  today: string;
  methods: PaymentMethodDto[];
  payment: PaymentDto | null;
}) {
  const t = useTranslations("payments.form");
  const tc = useTranslations("common");
  const [state, action] = useActionState(
    savePayment.bind(null, invoiceId, payment?.id ?? null),
    null,
  );
  const values = state?.values;
  const errors = state?.fieldErrors;
  const v = (key: string, fallback: string | null | undefined) => values?.[key] ?? fallback ?? "";
  const [kind, setKind] = useState<PaymentKind>(
    (values?.kind as PaymentKind | undefined) ?? payment?.kind ?? "PAYMENT",
  );
  const [fx, setFx] = useState(Boolean(values?.receivedCurrency || payment?.receivedCurrency));

  return (
    // keyed by the entry so switching between "record" and "edit" resets every field
    <form key={payment?.id ?? "new"} action={action}>
      <Card>
        <CardHeader>
          <div>
            <CardTitle>{payment ? t("editTitle") : t("recordTitle")}</CardTitle>
            <CardDescription>{t("description", { currency })}</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <FormMessage state={state} />
          <FieldGroup>
            <Field label={t("kind")} htmlFor="kind" error={errors?.kind} required>
              <Select
                id="kind"
                name="kind"
                value={kind}
                onChange={(e) => setKind(e.target.value as PaymentKind)}
              >
                {KINDS.map((k) => (
                  <option key={k} value={k}>
                    {t(`kinds.${k}`)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t("date")} htmlFor="paymentDate" error={errors?.paymentDate} required>
              <DateField
                id="paymentDate"
                name="paymentDate"
                defaultValue={v("paymentDate", payment?.paymentDate ?? today)}
              />
            </Field>
            <Field
              label={kind === "REFUND" ? t("amountRefunded") : t("amountApplied")}
              htmlFor="amountApplied"
              error={errors?.amountApplied}
              hint={kind === "REFUND" ? t("refundHint") : undefined}
              required
            >
              <Input
                id="amountApplied"
                name="amountApplied"
                type="number"
                step="0.01"
                defaultValue={v("amountApplied", payment?.amountApplied)}
              />
            </Field>
            <Field
              label={t("tdsDeducted")}
              htmlFor="tdsDeducted"
              error={errors?.tdsDeducted}
              hint={t("tdsHint")}
            >
              <Input
                id="tdsDeducted"
                name="tdsDeducted"
                type="number"
                step="0.01"
                min="0"
                defaultValue={v("tdsDeducted", payment?.tdsDeducted ?? "0")}
                disabled={kind !== "PAYMENT"}
              />
            </Field>
            <Field label={t("bankFees")} htmlFor="bankFees" error={errors?.bankFees}>
              <Input
                id="bankFees"
                name="bankFees"
                type="number"
                step="0.01"
                min="0"
                defaultValue={v("bankFees", payment?.bankFees ?? "0")}
              />
            </Field>
            <Field
              label={t("receivedInto")}
              htmlFor="paymentMethodProfileId"
              error={errors?.paymentMethodProfileId}
            >
              <Select
                id="paymentMethodProfileId"
                name="paymentMethodProfileId"
                defaultValue={v("paymentMethodProfileId", payment?.paymentMethodProfileId)}
              >
                <option value="">{t("noMethod")}</option>
                {methods.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label={t("reference")}
              htmlFor="reference"
              error={errors?.reference}
              hint={t("referenceHint")}
            >
              <Input
                id="reference"
                name="reference"
                className="font-mono"
                defaultValue={v("reference", payment?.reference)}
              />
            </Field>
          </FieldGroup>
          <label className="flex cursor-pointer items-center gap-2 text-app-body text-ink">
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={fx}
              onChange={(e) => setFx(e.target.checked)}
            />
            {t("otherCurrency")}
          </label>
          {fx ? (
            <FieldGroup>
              <Field
                label={t("amountReceived")}
                htmlFor="receivedAmount"
                error={errors?.receivedAmount}
                required
              >
                <Input
                  id="receivedAmount"
                  name="receivedAmount"
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={v("receivedAmount", payment?.receivedAmount)}
                />
              </Field>
              <Field
                label={t("receivedCurrency")}
                htmlFor="receivedCurrency"
                error={errors?.receivedCurrency}
                required
              >
                <Select
                  id="receivedCurrency"
                  name="receivedCurrency"
                  defaultValue={v("receivedCurrency", payment?.receivedCurrency ?? "USD")}
                >
                  {COMMON_CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field
                label={t("exchangeRate")}
                htmlFor="exchangeRate"
                error={errors?.exchangeRate}
                hint={t("exchangeRateHint", { currency })}
                required
              >
                <Input
                  id="exchangeRate"
                  name="exchangeRate"
                  type="number"
                  step="0.00000001"
                  min="0"
                  defaultValue={v("exchangeRate", payment?.exchangeRate)}
                />
              </Field>
            </FieldGroup>
          ) : null}
          <Field label={t("notes")} htmlFor="notes" error={errors?.notes}>
            <Textarea id="notes" name="notes" defaultValue={v("notes", payment?.notes)} />
          </Field>
          <ReceiptsField name="attachmentAssetIds" initial={payment?.attachments ?? []} />
          <div className="flex items-center gap-2">
            <SubmitButton pendingLabel={tc("saving")}>
              {payment ? t("saveChanges") : t("record")}
            </SubmitButton>
            {payment ? (
              <Button asChild variant="tertiary">
                <Link href={`/invoices/${invoiceId}/payments`}>{tc("cancel")}</Link>
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
