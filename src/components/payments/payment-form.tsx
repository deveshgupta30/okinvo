"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { AssetPicker } from "@/components/forms/asset-picker";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { COMMON_CURRENCIES } from "@/lib/schemas";
import { savePayment } from "@/server/actions/payments";
import type { PaymentMethodDto } from "@/server/dal/payment-methods";
import type { PaymentDto, PaymentKind } from "@/server/dal/payments";

const KIND_LABELS: Record<PaymentKind, string> = {
  PAYMENT: "Payment received",
  REFUND: "Refund issued",
  WRITE_OFF: "Write-off",
};

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
    <form action={action}>
      <Card>
        <CardHeader>
          <div>
            <CardTitle>{payment ? "Edit entry" : "Record a payment"}</CardTitle>
            <CardDescription>
              Amounts are in the invoice currency ({currency}); TDS deducted is part of the amount
              applied.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <FormMessage state={state} />
          <FieldGroup>
            <Field label="Kind" htmlFor="kind" error={errors?.kind} required>
              <Select
                id="kind"
                name="kind"
                value={kind}
                onChange={(e) => setKind(e.target.value as PaymentKind)}
              >
                {(Object.keys(KIND_LABELS) as PaymentKind[]).map((k) => (
                  <option key={k} value={k}>
                    {KIND_LABELS[k]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Date" htmlFor="paymentDate" error={errors?.paymentDate} required>
              <Input
                id="paymentDate"
                name="paymentDate"
                type="date"
                className="font-mono"
                defaultValue={v("paymentDate", payment?.paymentDate ?? today)}
              />
            </Field>
            <Field
              label={kind === "REFUND" ? "Amount refunded (negative)" : "Amount applied"}
              htmlFor="amountApplied"
              error={errors?.amountApplied}
              hint={kind === "REFUND" ? "Enter a negative amount, e.g. -500" : undefined}
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
              label="TDS deducted"
              htmlFor="tdsDeducted"
              error={errors?.tdsDeducted}
              hint="Tax the client withheld; counts towards the amount applied"
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
            <Field label="Bank fees" htmlFor="bankFees" error={errors?.bankFees}>
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
              label="Received into"
              htmlFor="paymentMethodProfileId"
              error={errors?.paymentMethodProfileId}
            >
              <Select
                id="paymentMethodProfileId"
                name="paymentMethodProfileId"
                defaultValue={v("paymentMethodProfileId", payment?.paymentMethodProfileId)}
              >
                <option value="">—</option>
                {methods.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label="Reference"
              htmlFor="reference"
              error={errors?.reference}
              hint="UTR, transaction id, cheque number"
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
            Received in another currency
          </label>
          {fx ? (
            <FieldGroup>
              <Field
                label="Amount received"
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
                label="Received currency"
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
                label="Exchange rate"
                htmlFor="exchangeRate"
                error={errors?.exchangeRate}
                hint={`1 unit received = ? ${currency}`}
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
          <Field label="Notes" htmlFor="notes" error={errors?.notes}>
            <Textarea id="notes" name="notes" defaultValue={v("notes", payment?.notes)} />
          </Field>
          <AssetPicker
            name="receiptAssetId"
            kind="RECEIPT"
            label="Receipt"
            assetId={payment?.receiptAssetId}
            hint="PNG, JPEG, WebP or PDF up to 10 MB"
          />
          <div className="flex items-center gap-2">
            <SubmitButton pendingLabel="Saving…">
              {payment ? "Save changes" : "Record"}
            </SubmitButton>
            {payment ? (
              <Button asChild variant="tertiary">
                <Link href={`/invoices/${invoiceId}/payments`}>Cancel</Link>
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
