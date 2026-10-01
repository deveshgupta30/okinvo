"use client";

import { suggestRoundingAdjustment } from "@/lib/invoices";
import { D } from "@/lib/money";

import Link from "next/link";
import { useActionState, useDeferredValue, useMemo, useState } from "react";
import { ScaledPreview } from "@/components/documents/scaled-preview";
import { DisplayConfigFields } from "@/components/forms/display-config-fields";
import { FormMessage } from "@/components/forms/form-message";
import { LineItemsEditor } from "@/components/invoices/line-items-editor";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Amount } from "@/components/ui/mono";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { addDays } from "@/lib/dates";
import { buildDocumentViewModel, DocumentPreview, PAPER } from "@/lib/documents";
import { formatMoney } from "@/lib/format";
import { previewFromBuilder, type BuilderValues } from "@/lib/invoices/client-preview";
import { COMMON_CURRENCIES, DEFAULT_TEMPLATE_CONFIG, TAX_REGIMES } from "@/lib/schemas";
import { GST_RATES, UK_VAT_RATES } from "@/lib/tax";
import { saveDraft } from "@/server/actions/invoices";
import type { BuilderContext } from "@/server/dal/invoice-builder";

const REGIME_LABELS: Record<(typeof TAX_REGIMES)[number], string> = {
  INDIA_GST: "India GST",
  UK_VAT: "UK VAT",
  US_SALES_TAX: "US sales tax",
  NONE: "No tax",
};

const PT_TO_PX = 96 / 72;

export function InvoiceBuilder({
  context,
  invoiceId,
}: {
  context: BuilderContext;
  invoiceId: string | null;
}) {
  const [state, action] = useActionState(saveDraft.bind(null, invoiceId), null);
  const [values, setValues] = useState<BuilderValues>(context.initial);
  const deferred = useDeferredValue(values);
  const errors = state?.fieldErrors;

  const profile = context.profiles.find((p) => p.id === values.issuerProfileId) ?? null;
  const client = context.clients.find((c) => c.id === values.clientId) ?? null;
  const config = (profile && context.templateConfigs[profile.id]) ?? DEFAULT_TEMPLATE_CONFIG;

  const preview = useMemo(() => {
    const p = context.profiles.find((x) => x.id === deferred.issuerProfileId) ?? null;
    const c = context.clients.find((x) => x.id === deferred.clientId) ?? null;
    const result = previewFromBuilder(deferred, {
      profile: p,
      client: c,
      methods: context.methods,
    });
    const vm = buildDocumentViewModel(result.input, {
      appUrl: "",
      assetUrl: (id) => `/api/assets/id/${id}`,
      config,
      draft: true,
    });
    return { ...result, vm };
  }, [deferred, context, config]);

  const set = <K extends keyof BuilderValues>(key: K, v: BuilderValues[K]) =>
    setValues((s) => ({ ...s, [key]: v }));

  const onProfile = (id: string) => {
    const p = context.profiles.find((x) => x.id === id);
    setValues((s) => ({
      ...s,
      issuerProfileId: id,
      taxRegime: p?.defaultTaxRegime ?? s.taxRegime,
      displayConfig: p?.defaultDisplayConfig ?? s.displayConfig,
      currency: client ? s.currency : (p?.baseCurrency ?? s.currency),
      notes: s.notes || (p?.defaultNotes ?? ""),
      terms: s.terms || (p?.defaultTerms ?? ""),
      tdsRate: client?.defaultTdsRate ?? p?.defaultTdsRate ?? s.tdsRate,
    }));
  };
  const onClient = (id: string) => {
    const c = context.clients.find((x) => x.id === id);
    setValues((s) => ({
      ...s,
      clientId: id,
      currency: c?.currency ?? s.currency,
      dueDate: c ? addDays(s.issueDate || context.today, c.paymentTermsDays) : s.dueDate,
      tdsRate: c?.defaultTdsRate ?? profile?.defaultTdsRate ?? s.tdsRate,
    }));
  };

  const rates =
    values.taxRegime === "INDIA_GST"
      ? GST_RATES
      : values.taxRegime === "UK_VAT"
        ? UK_VAT_RATES
        : null;
  const locale = profile?.locale ?? "en-IN";
  const paper = PAPER[config.paper.size];

  return (
    <form action={action} className="grid gap-6 xl:grid-cols-[7fr_5fr]">
      <div className="flex min-w-0 flex-col gap-6">
        <FormMessage state={state} />
        <Card>
          <CardHeader>
            <CardTitle>Parties</CardTitle>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Field
                label="Issuer profile"
                htmlFor="issuerProfileId"
                error={errors?.issuerProfileId}
                required
              >
                <Select
                  id="issuerProfileId"
                  name="issuerProfileId"
                  value={values.issuerProfileId}
                  onChange={(e) => onProfile(e.target.value)}
                >
                  <option value="">Choose…</option>
                  {context.profiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                      {p.archivedAt ? " (archived)" : ""}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Client" htmlFor="clientId" error={errors?.clientId} required>
                <Select
                  id="clientId"
                  name="clientId"
                  value={values.clientId}
                  onChange={(e) => onClient(e.target.value)}
                >
                  <option value="">Choose…</option>
                  {context.clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.displayName}
                      {c.archivedAt ? " (archived)" : ""}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Issue date" htmlFor="issueDate" error={errors?.issueDate} required>
                <Input
                  id="issueDate"
                  name="issueDate"
                  type="date"
                  className="font-mono"
                  value={values.issueDate}
                  onChange={(e) => set("issueDate", e.target.value)}
                />
              </Field>
              <Field label="Due date" htmlFor="dueDate" error={errors?.dueDate} required>
                <Input
                  id="dueDate"
                  name="dueDate"
                  type="date"
                  className="font-mono"
                  value={values.dueDate}
                  onChange={(e) => set("dueDate", e.target.value)}
                />
              </Field>
              <Field label="Currency" htmlFor="currency" error={errors?.currency} required>
                <Select
                  id="currency"
                  name="currency"
                  value={values.currency}
                  onChange={(e) => set("currency", e.target.value)}
                >
                  {COMMON_CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                  {!COMMON_CURRENCIES.includes(
                    values.currency as (typeof COMMON_CURRENCIES)[number],
                  ) && values.currency ? (
                    <option value={values.currency}>{values.currency}</option>
                  ) : null}
                </Select>
              </Field>
              <Field
                label="FX rate to base currency"
                htmlFor="fxRateToBase"
                error={errors?.fxRateToBase}
                hint={
                  profile
                    ? `1 ${values.currency} = ? ${profile.baseCurrency} (reporting only)`
                    : undefined
                }
              >
                <Input
                  id="fxRateToBase"
                  name="fxRateToBase"
                  type="number"
                  step="0.00000001"
                  min="0"
                  value={values.fxRateToBase}
                  onChange={(e) => set("fxRateToBase", e.target.value)}
                />
              </Field>
              <Field label="PO reference" htmlFor="poReference" error={errors?.poReference}>
                <Input
                  id="poReference"
                  name="poReference"
                  value={values.poReference}
                  onChange={(e) => set("poReference", e.target.value)}
                />
              </Field>
            </FieldGroup>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Line items</CardTitle>
              <CardDescription>
                Pick from the catalogue to copy its values, or type a line.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <LineItemsEditor
              items={values.items}
              services={context.services}
              rates={rates}
              allowExempt={values.taxRegime === "UK_VAT"}
              errors={errors}
              onChange={(items) => set("items", items)}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Tax, discount and TDS</CardTitle>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Field label="Tax regime" htmlFor="taxRegime" error={errors?.taxRegime} required>
                <Select
                  id="taxRegime"
                  name="taxRegime"
                  value={values.taxRegime}
                  onChange={(e) => set("taxRegime", e.target.value as BuilderValues["taxRegime"])}
                >
                  {TAX_REGIMES.map((r) => (
                    <option key={r} value={r}>
                      {REGIME_LABELS[r]}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="flex items-end pb-2">
                <Checkbox
                  name="isReverseCharge"
                  label="Reverse charge"
                  description="Tax payable by the recipient"
                  checked={values.isReverseCharge}
                  onChange={(e) => set("isReverseCharge", e.target.checked)}
                />
              </div>
              <Field
                label="Discount"
                htmlFor="discount.type"
                error={errors?.["discount.value"] ?? errors?.discount}
              >
                <div className="flex gap-2">
                  <Select
                    id="discount.type"
                    name="discount.type"
                    value={values.discountType}
                    onChange={(e) =>
                      set("discountType", e.target.value as BuilderValues["discountType"])
                    }
                    className="w-36"
                  >
                    <option value="">None</option>
                    <option value="PERCENT">Percent</option>
                    <option value="AMOUNT">Amount</option>
                  </Select>
                  <Input
                    name="discount.value"
                    type="number"
                    step="0.01"
                    min="0"
                    value={values.discountValue}
                    disabled={!values.discountType}
                    onChange={(e) => set("discountValue", e.target.value)}
                  />
                </div>
              </Field>
              <Field
                label="Rounding adjustment"
                htmlFor="roundingAdjustment"
                error={errors?.roundingAdjustment}
                hint="Optional, to a whole unit; must be under 1"
              >
                <div className="flex gap-2">
                  <Input
                    id="roundingAdjustment"
                    name="roundingAdjustment"
                    type="number"
                    step="0.01"
                    min="-0.99"
                    max="0.99"
                    value={values.roundingAdjustment}
                    onChange={(e) => set("roundingAdjustment", e.target.value)}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      const base = D(preview.totals.total).minus(
                        D(preview.totals.roundingAdjustment),
                      );
                      const adj = suggestRoundingAdjustment(base, values.currency);
                      set("roundingAdjustment", adj.isZero() ? "" : adj.toFixed(2));
                    }}
                  >
                    Round
                  </Button>
                </div>
              </Field>
              <Field
                label="Expected TDS rate (%)"
                htmlFor="tdsRate"
                error={errors?.tdsRate}
                hint="Informational; printed when the TDS breakdown is on"
              >
                <Input
                  id="tdsRate"
                  name="tdsRate"
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={values.tdsRate}
                  onChange={(e) => set("tdsRate", e.target.value)}
                />
              </Field>
            </FieldGroup>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Payment methods</CardTitle>
              <CardDescription>Printed in the order ticked.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {context.methods.length === 0 ? (
              <p className="text-app-body text-ink-subtle">
                No active payment methods.{" "}
                <Link href="/settings/payment-methods/new" className="text-link">
                  Add one
                </Link>
                .
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {context.methods.map((m) => {
                  const idx = values.paymentMethodIds.indexOf(m.id);
                  return (
                    <Checkbox
                      key={m.id}
                      name="paymentMethodIds"
                      value={m.id}
                      checked={idx >= 0}
                      label={`${m.name}${idx >= 0 ? ` · #${idx + 1}` : ""}`}
                      description={m.lines?.map((l) => l.value).join(" · ")}
                      onChange={(e) =>
                        set(
                          "paymentMethodIds",
                          e.target.checked
                            ? [...values.paymentMethodIds, m.id]
                            : values.paymentMethodIds.filter((x) => x !== m.id),
                        )
                      }
                    />
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>What prints</CardTitle>
              <CardDescription>Starts from the issuer profile&apos;s defaults.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <DisplayConfigFields
              key={values.issuerProfileId}
              prefix="display"
              config={values.displayConfig}
              onChange={(cfg) => set("displayConfig", cfg)}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Notes and terms</CardTitle>
          </CardHeader>
          <CardContent>
            <Field label="Notes" htmlFor="notes" error={errors?.notes}>
              <Textarea
                id="notes"
                name="notes"
                value={values.notes}
                onChange={(e) => set("notes", e.target.value)}
              />
            </Field>
            <Field label="Terms" htmlFor="terms" error={errors?.terms}>
              <Textarea
                id="terms"
                name="terms"
                value={values.terms}
                onChange={(e) => set("terms", e.target.value)}
              />
            </Field>
          </CardContent>
        </Card>

        <div className="flex flex-wrap items-center gap-2">
          <SubmitButton name="intent" value="save" variant="secondary" pendingLabel="Saving…">
            Save draft
          </SubmitButton>
          <SubmitButton name="intent" value="issue" pendingLabel="Issuing…">
            Save and issue
          </SubmitButton>
          <Button asChild variant="tertiary">
            <Link href={invoiceId ? `/invoices/${invoiceId}` : "/invoices"}>Cancel</Link>
          </Button>
        </div>
      </div>

      <aside className="flex min-w-0 flex-col gap-4 xl:sticky xl:top-6 xl:self-start">
        <Card className="p-4">
          <dl className="grid grid-cols-[1fr_auto] gap-y-1 text-app-body">
            <dt className="text-ink-subtle">Subtotal</dt>
            <dd className="text-right">
              <Amount>
                {formatMoney(preview.totals.subtotal, preview.input.currency, locale)}
              </Amount>
            </dd>
            {preview.totals.discountAmount !== "0.00" && preview.totals.discountAmount !== "0" ? (
              <>
                <dt className="text-ink-subtle">Discount</dt>
                <dd className="text-right">
                  <Amount>
                    −{formatMoney(preview.totals.discountAmount, preview.input.currency, locale)}
                  </Amount>
                </dd>
              </>
            ) : null}
            <dt className="text-ink-subtle">Tax</dt>
            <dd className="text-right">
              <Amount>
                {formatMoney(preview.totals.taxAmount, preview.input.currency, locale)}
              </Amount>
            </dd>
            <dt className="text-app-label text-ink">Total</dt>
            <dd className="text-right text-app-section">
              <Amount>{formatMoney(preview.totals.total, preview.input.currency, locale)}</Amount>
            </dd>
            {preview.totals.tdsExpected !== "0.00" && preview.totals.tdsExpected !== "0" ? (
              <>
                <dt className="text-ink-subtle">TDS expected</dt>
                <dd className="text-right">
                  <Amount>
                    {formatMoney(preview.totals.tdsExpected, preview.input.currency, locale)}
                  </Amount>
                </dd>
                <dt className="text-ink-subtle">Net expected</dt>
                <dd className="text-right">
                  <Amount>
                    {formatMoney(preview.totals.netExpected, preview.input.currency, locale)}
                  </Amount>
                </dd>
              </>
            ) : null}
          </dl>
          {preview.warnings.length > 0 ? (
            <ul className="mt-3 flex flex-col gap-1 text-app-caption text-semantic-warning">
              {preview.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          ) : null}
        </Card>
        <ScaledPreview pageWidthPx={paper.width * PT_TO_PX} pageHeightPx={paper.height * PT_TO_PX}>
          <DocumentPreview vm={preview.vm} config={config} />
        </ScaledPreview>
      </aside>
    </form>
  );
}
