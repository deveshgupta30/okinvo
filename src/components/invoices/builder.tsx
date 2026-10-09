"use client";

import { suggestRoundingAdjustment } from "@/lib/invoices";
import { D } from "@/lib/money";

import Link from "next/link";
import { useTranslations } from "next-intl";
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

/** Tax regime → its `invoices.builder.regimes` catalogue key. */
const REGIME_KEY = {
  INDIA_GST: "indiaGst",
  UK_VAT: "ukVat",
  US_SALES_TAX: "usSalesTax",
  NONE: "none",
} as const satisfies Record<(typeof TAX_REGIMES)[number], string>;

const PT_TO_PX = 96 / 72;

/** Catalogue items with no tags are offered to every profile; tagged ones only to theirs (spec §5.2). */
const offeredTo =
  (issuerProfileId: string) =>
  (item: { issuerProfileIds: string[] }): boolean =>
    item.issuerProfileIds.length === 0 || item.issuerProfileIds.includes(issuerProfileId);

export function InvoiceBuilder({
  context,
  invoiceId,
}: {
  context: BuilderContext;
  invoiceId: string | null;
}) {
  const t = useTranslations("invoices.builder");
  const tc = useTranslations("common");
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
            <CardTitle>{t("parties")}</CardTitle>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Field
                label={t("issuerProfile")}
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
                  <option value="">{tc("choose")}</option>
                  {context.profiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.archivedAt ? t("archivedOption", { label: p.label }) : p.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t("client")} htmlFor="clientId" error={errors?.clientId} required>
                <Select
                  id="clientId"
                  name="clientId"
                  value={values.clientId}
                  onChange={(e) => onClient(e.target.value)}
                >
                  <option value="">{tc("choose")}</option>
                  {context.clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.archivedAt ? t("archivedOption", { label: c.displayName }) : c.displayName}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t("issueDate")} htmlFor="issueDate" error={errors?.issueDate} required>
                <Input
                  id="issueDate"
                  name="issueDate"
                  type="date"
                  className="font-mono"
                  value={values.issueDate}
                  onChange={(e) => set("issueDate", e.target.value)}
                />
              </Field>
              <Field label={t("dueDate")} htmlFor="dueDate" error={errors?.dueDate} required>
                <Input
                  id="dueDate"
                  name="dueDate"
                  type="date"
                  className="font-mono"
                  value={values.dueDate}
                  onChange={(e) => set("dueDate", e.target.value)}
                />
              </Field>
              <Field label={tc("currency")} htmlFor="currency" error={errors?.currency} required>
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
                label={t("fxRate")}
                htmlFor="fxRateToBase"
                error={errors?.fxRateToBase}
                hint={
                  profile
                    ? t("fxHint", { currency: values.currency, base: profile.baseCurrency })
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
              <Field label={t("poReference")} htmlFor="poReference" error={errors?.poReference}>
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
              <CardTitle>{t("lineItems")}</CardTitle>
              <CardDescription>{t("lineItemsHint")}</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <LineItemsEditor
              items={values.items}
              services={context.services.filter(offeredTo(values.issuerProfileId))}
              products={context.products.filter(offeredTo(values.issuerProfileId))}
              rates={rates}
              allowExempt={values.taxRegime === "UK_VAT"}
              errors={errors}
              onChange={(items) => set("items", items)}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("taxDiscountTds")}</CardTitle>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Field label={t("taxRegime")} htmlFor="taxRegime" error={errors?.taxRegime} required>
                <Select
                  id="taxRegime"
                  name="taxRegime"
                  value={values.taxRegime}
                  onChange={(e) => set("taxRegime", e.target.value as BuilderValues["taxRegime"])}
                >
                  {TAX_REGIMES.map((r) => (
                    <option key={r} value={r}>
                      {t(`regimes.${REGIME_KEY[r]}`)}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="flex items-end pb-2">
                <Checkbox
                  name="isReverseCharge"
                  label={t("reverseCharge")}
                  description={t("reverseChargeHint")}
                  checked={values.isReverseCharge}
                  onChange={(e) => set("isReverseCharge", e.target.checked)}
                />
              </div>
              <Field
                label={t("discount")}
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
                    <option value="">{tc("none")}</option>
                    <option value="PERCENT">{t("percent")}</option>
                    <option value="AMOUNT">{t("amount")}</option>
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
                label={t("rounding")}
                htmlFor="roundingAdjustment"
                error={errors?.roundingAdjustment}
                hint={t("roundingHint")}
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
                    {t("round")}
                  </Button>
                </div>
              </Field>
              <Field
                label={t("tdsRate")}
                htmlFor="tdsRate"
                error={errors?.tdsRate}
                hint={t("tdsRateHint")}
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
              <CardTitle>{t("paymentMethods")}</CardTitle>
              <CardDescription>{t("paymentMethodsHint")}</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {context.methods.length === 0 ? (
              <p className="text-app-body text-ink-subtle">
                {t.rich("noPaymentMethods", {
                  link: (chunks) => (
                    <Link href="/settings/payment-methods/new" className="text-link">
                      {chunks}
                    </Link>
                  ),
                })}
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
              <CardTitle>{t("whatPrints")}</CardTitle>
              <CardDescription>{t("whatPrintsHint")}</CardDescription>
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
            <CardTitle>{t("notesAndTerms")}</CardTitle>
          </CardHeader>
          <CardContent>
            <Field label={t("notes")} htmlFor="notes" error={errors?.notes}>
              <Textarea
                id="notes"
                name="notes"
                value={values.notes}
                onChange={(e) => set("notes", e.target.value)}
              />
            </Field>
            <Field label={t("terms")} htmlFor="terms" error={errors?.terms}>
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
          <SubmitButton name="intent" value="save" variant="secondary" pendingLabel={tc("saving")}>
            {t("saveDraft")}
          </SubmitButton>
          <SubmitButton name="intent" value="issue" pendingLabel={t("issuing")}>
            {t("saveAndIssue")}
          </SubmitButton>
          <Button asChild variant="tertiary">
            <Link href={invoiceId ? `/invoices/${invoiceId}` : "/invoices"}>{tc("cancel")}</Link>
          </Button>
        </div>
      </div>

      <aside className="flex min-w-0 flex-col gap-4 xl:sticky xl:top-6 xl:self-start">
        <Card className="p-4">
          <dl className="grid grid-cols-[1fr_auto] gap-y-1 text-app-body">
            <dt className="text-ink-subtle">{t("subtotal")}</dt>
            <dd className="text-right">
              <Amount>
                {formatMoney(preview.totals.subtotal, preview.input.currency, locale)}
              </Amount>
            </dd>
            {preview.totals.discountAmount !== "0.00" && preview.totals.discountAmount !== "0" ? (
              <>
                <dt className="text-ink-subtle">{t("discount")}</dt>
                <dd className="text-right">
                  <Amount>
                    −{formatMoney(preview.totals.discountAmount, preview.input.currency, locale)}
                  </Amount>
                </dd>
              </>
            ) : null}
            <dt className="text-ink-subtle">{t("tax")}</dt>
            <dd className="text-right">
              <Amount>
                {formatMoney(preview.totals.taxAmount, preview.input.currency, locale)}
              </Amount>
            </dd>
            <dt className="text-app-label text-ink">{tc("total")}</dt>
            <dd className="text-right text-app-section">
              <Amount>{formatMoney(preview.totals.total, preview.input.currency, locale)}</Amount>
            </dd>
            {preview.totals.tdsExpected !== "0.00" && preview.totals.tdsExpected !== "0" ? (
              <>
                <dt className="text-ink-subtle">{t("tdsExpected")}</dt>
                <dd className="text-right">
                  <Amount>
                    {formatMoney(preview.totals.tdsExpected, preview.input.currency, locale)}
                  </Amount>
                </dd>
                <dt className="text-ink-subtle">{t("netExpected")}</dt>
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
