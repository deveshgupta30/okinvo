"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { AddressFields } from "@/components/forms/address-fields";
import { AssetPicker } from "@/components/forms/asset-picker";
import { CountryStateFields } from "@/components/forms/country-state-fields";
import { DisplayConfigFields } from "@/components/forms/display-config-fields";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { EAS } from "@/lib/einvoice/eas";
import { PLACEHOLDER_HELP } from "@/lib/email/templates";
import { COMMON_CURRENCIES, DEFAULT_DISPLAY_CONFIG, TAX_REGIMES } from "@/lib/schemas";
import { LOCALES } from "@/lib/schemas/profile-input";
import { saveProfile } from "@/server/actions/profiles";
import type { ProfileDto } from "@/server/dal/profiles";

const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
] as const;

const REGIME_KEYS = {
  INDIA_GST: "indiaGst",
  UK_VAT: "ukVat",
  US_SALES_TAX: "usSalesTax",
  NONE: "none",
} as const satisfies Record<(typeof TAX_REGIMES)[number], string>;

export function ProfileForm({
  profile,
  prefill,
}: {
  profile: ProfileDto | null;
  /** First-run defaults from onboarding (spec §4.2); only used for a new profile. */
  prefill?: Partial<Record<string, string>> | undefined;
}) {
  const t = useTranslations("settings.profiles.form");
  const tp = useTranslations("settings.profiles");
  const tc = useTranslations("common");
  const [state, action] = useActionState(saveProfile.bind(null, profile?.id ?? null), null);
  const values = state?.values;
  const errors = state?.fieldErrors;
  const v = (key: string, fallback: string | number | null | undefined) =>
    values?.[key] ?? prefill?.[key] ?? (fallback == null ? "" : String(fallback));

  return (
    <form action={action} className="flex flex-col gap-6">
      <FormMessage state={state} />

      <Card>
        <CardHeader>
          <div>
            <CardTitle>{t("identityTitle")}</CardTitle>
            <CardDescription>{t("identityDescription")}</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field label={t("type")} htmlFor="type" error={errors?.type} required>
              <Select id="type" name="type" defaultValue={v("type", profile?.type ?? "INDIVIDUAL")}>
                <option value="INDIVIDUAL">{tp("types.individual")}</option>
                <option value="COMPANY">{tp("types.company")}</option>
              </Select>
            </Field>
            <Field
              label={t("label")}
              htmlFor="label"
              error={errors?.label}
              hint={t("labelHint")}
              required
            >
              <Input id="label" name="label" defaultValue={v("label", profile?.label)} />
            </Field>
            <Field label={t("legalName")} htmlFor="legalName" error={errors?.legalName} required>
              <Input
                id="legalName"
                name="legalName"
                defaultValue={v("legalName", profile?.legalName)}
              />
            </Field>
            <Field label={t("tradeName")} htmlFor="tradeName" error={errors?.tradeName}>
              <Input
                id="tradeName"
                name="tradeName"
                defaultValue={v("tradeName", profile?.tradeName)}
              />
            </Field>
            <Field label={t("designation")} htmlFor="designation" error={errors?.designation}>
              <Input
                id="designation"
                name="designation"
                defaultValue={v("designation", profile?.designation)}
              />
            </Field>
            <Field label={t("email")} htmlFor="email" error={errors?.email} required>
              <Input
                id="email"
                name="email"
                type="email"
                defaultValue={v("email", profile?.email)}
              />
            </Field>
            <Field label={t("phone")} htmlFor="phone" error={errors?.phone}>
              <Input id="phone" name="phone" defaultValue={v("phone", profile?.phone)} />
            </Field>
            <Field label={t("website")} htmlFor="website" error={errors?.website}>
              <Input id="website" name="website" defaultValue={v("website", profile?.website)} />
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("addressTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <CountryStateFields
              country={v("countryCode", profile?.countryCode ?? "IN")}
              state={v("stateCode", profile?.stateCode)}
              gstStateCode={v("gstStateCode", profile?.gstStateCode)}
              errors={errors}
            />
          </FieldGroup>
          <AddressFields
            prefix="address"
            defaults={profile?.address}
            values={values}
            errors={errors}
            hideState
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>{t("taxTitle")}</CardTitle>
            <CardDescription>{t("taxDescription")}</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field label={t("pan")} htmlFor="panNumber" error={errors?.panNumber}>
              <Input
                id="panNumber"
                name="panNumber"
                className="font-mono uppercase"
                defaultValue={v("panNumber", profile?.panNumber)}
              />
            </Field>
            <Field label={t("gstin")} htmlFor="gstin" error={errors?.gstin}>
              <Input
                id="gstin"
                name="gstin"
                className="font-mono uppercase"
                defaultValue={v("gstin", profile?.gstin)}
              />
            </Field>
            <Field label={t("cin")} htmlFor="cinNumber" error={errors?.cinNumber}>
              <Input
                id="cinNumber"
                name="cinNumber"
                className="font-mono"
                defaultValue={v("cinNumber", profile?.cinNumber)}
              />
            </Field>
            <Field label={t("ukVatNumber")} htmlFor="ukVatNumber" error={errors?.ukVatNumber}>
              <Input
                id="ukVatNumber"
                name="ukVatNumber"
                className="font-mono"
                defaultValue={v("ukVatNumber", profile?.ukVatNumber)}
              />
            </Field>
            <Field
              label={t("usTaxId")}
              htmlFor="usTaxId"
              error={errors?.usTaxId}
              hint={t("usTaxIdHint")}
            >
              <Input
                id="usTaxId"
                name="usTaxId"
                className="font-mono"
                defaultValue={v("usTaxId", profile?.usTaxId)}
              />
            </Field>
            <Field
              label={t("lutNumber")}
              htmlFor="lutNumber"
              error={errors?.lutNumber}
              hint={t("lutNumberHint")}
            >
              <Input
                id="lutNumber"
                name="lutNumber"
                className="font-mono"
                defaultValue={v("lutNumber", profile?.lutNumber)}
              />
            </Field>
            <Field
              label={t("lutFiscalYear")}
              htmlFor="lutFiscalYear"
              error={errors?.lutFiscalYear}
              hint={t("lutFiscalYearHint")}
            >
              <Input
                id="lutFiscalYear"
                name="lutFiscalYear"
                className="font-mono"
                defaultValue={v("lutFiscalYear", profile?.lutFiscalYear)}
              />
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>{t("einvoiceTitle")}</CardTitle>
            <CardDescription>{t("einvoiceDescription")}</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field
              label={t("electronicAddress")}
              htmlFor="electronicAddress"
              error={errors?.electronicAddress}
              hint={t("electronicAddressHint")}
            >
              <Input
                id="electronicAddress"
                name="electronicAddress"
                className="font-mono"
                defaultValue={v("electronicAddress", profile?.electronicAddress)}
              />
            </Field>
            <Field
              label={t("electronicAddressScheme")}
              htmlFor="electronicAddressScheme"
              error={errors?.electronicAddressScheme}
            >
              <Select
                id="electronicAddressScheme"
                name="electronicAddressScheme"
                defaultValue={v("electronicAddressScheme", profile?.electronicAddressScheme)}
              >
                <option value="">{t("electronicAddressSchemeNone")}</option>
                {EAS.map((e) => (
                  <option key={e.code} value={e.code}>
                    {e.code} · {e.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Checkbox
              id="einvoiceEnabled"
              name="einvoiceEnabled"
              label={t("einvoiceEnabled")}
              description={t("einvoiceEnabledHint")}
              defaultChecked={profile?.einvoiceEnabled ?? false}
            />
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("defaultsTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field
              label={t("baseCurrency")}
              htmlFor="baseCurrency"
              error={errors?.baseCurrency}
              required
            >
              <Select
                id="baseCurrency"
                name="baseCurrency"
                defaultValue={v("baseCurrency", profile?.baseCurrency ?? "INR")}
              >
                {COMMON_CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label={t("locale")}
              htmlFor="locale"
              error={errors?.locale}
              hint={t("localeHint")}
              required
            >
              <Select
                id="locale"
                name="locale"
                defaultValue={v("locale", profile?.locale ?? "en-IN")}
              >
                {LOCALES.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label={t("fiscalYearStart")}
              htmlFor="fiscalYearStartMonth"
              error={errors?.fiscalYearStartMonth}
              required
            >
              <Select
                id="fiscalYearStartMonth"
                name="fiscalYearStartMonth"
                defaultValue={v("fiscalYearStartMonth", profile?.fiscalYearStartMonth ?? 4)}
              >
                {MONTHS.map((m, i) => (
                  <option key={m} value={i + 1}>
                    {t(`months.${m}`)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label={t("taxRegime")}
              htmlFor="defaultTaxRegime"
              error={errors?.defaultTaxRegime}
              required
            >
              <Select
                id="defaultTaxRegime"
                name="defaultTaxRegime"
                defaultValue={v("defaultTaxRegime", profile?.defaultTaxRegime ?? "INDIA_GST")}
              >
                {TAX_REGIMES.map((r) => (
                  <option key={r} value={r}>
                    {t(`regimes.${REGIME_KEYS[r]}`)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label={t("invoiceNumberFormat")}
              htmlFor="invoiceNumberFormat"
              error={errors?.invoiceNumberFormat}
              hint={t("invoiceNumberFormatHint", {
                tokens: "{FY} {FYYYY} {YYYY} {YY} {MM} {SEQ} {SEQ:n}",
              })}
              required
            >
              <Input
                id="invoiceNumberFormat"
                name="invoiceNumberFormat"
                className="font-mono"
                defaultValue={v(
                  "invoiceNumberFormat",
                  profile?.invoiceNumberFormat ?? "INV/{FY}/{SEQ:3}",
                )}
              />
            </Field>
            <Field
              label={t("creditNoteNumberFormat")}
              htmlFor="creditNoteNumberFormat"
              error={errors?.creditNoteNumberFormat}
              required
            >
              <Input
                id="creditNoteNumberFormat"
                name="creditNoteNumberFormat"
                className="font-mono"
                defaultValue={v(
                  "creditNoteNumberFormat",
                  profile?.creditNoteNumberFormat ?? "CN/{FY}/{SEQ:3}",
                )}
              />
            </Field>
            <Field
              label={t("tdsRate")}
              htmlFor="defaultTdsRate"
              error={errors?.defaultTdsRate}
              hint={t("tdsRateHint")}
            >
              <Input
                id="defaultTdsRate"
                name="defaultTdsRate"
                type="number"
                step="0.01"
                min="0"
                max="100"
                defaultValue={v("defaultTdsRate", profile?.defaultTdsRate)}
              />
            </Field>
          </FieldGroup>
          <Field label={t("defaultNotes")} htmlFor="defaultNotes" error={errors?.defaultNotes}>
            <Textarea
              id="defaultNotes"
              name="defaultNotes"
              defaultValue={v("defaultNotes", profile?.defaultNotes)}
            />
          </Field>
          <Field label={t("defaultTerms")} htmlFor="defaultTerms" error={errors?.defaultTerms}>
            <Textarea
              id="defaultTerms"
              name="defaultTerms"
              defaultValue={v("defaultTerms", profile?.defaultTerms)}
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>{t("printTitle")}</CardTitle>
            <CardDescription>{t("printDescription")}</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <DisplayConfigFields
            prefix="display"
            config={profile?.defaultDisplayConfig ?? DEFAULT_DISPLAY_CONFIG}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>{t("emailTitle")}</CardTitle>
            <CardDescription>
              {t("emailDescription", {
                placeholders: PLACEHOLDER_HELP.map((p) => p.token).join(" "),
              })}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field
              label={t("emailCc")}
              htmlFor="emailCc"
              error={errors?.emailCc}
              hint={t("commaSeparated")}
            >
              <Input
                id="emailCc"
                name="emailCc"
                defaultValue={v("emailCc", profile?.emailCc.join(", "))}
              />
            </Field>
            <Field
              label={t("emailBcc")}
              htmlFor="emailBcc"
              error={errors?.emailBcc}
              hint={t("commaSeparated")}
            >
              <Input
                id="emailBcc"
                name="emailBcc"
                defaultValue={v("emailBcc", profile?.emailBcc.join(", "))}
              />
            </Field>
            <Field
              label={t("invoiceSubject")}
              htmlFor="emailInvoiceSubject"
              error={errors?.emailInvoiceSubject}
              hint={t("invoiceSubjectHint")}
            >
              <Input
                id="emailInvoiceSubject"
                name="emailInvoiceSubject"
                defaultValue={v("emailInvoiceSubject", profile?.emailInvoiceSubject)}
              />
            </Field>
            <Field
              label={t("creditNoteSubject")}
              htmlFor="emailCreditNoteSubject"
              error={errors?.emailCreditNoteSubject}
            >
              <Input
                id="emailCreditNoteSubject"
                name="emailCreditNoteSubject"
                defaultValue={v("emailCreditNoteSubject", profile?.emailCreditNoteSubject)}
              />
            </Field>
            <Field
              label={t("invoiceBody")}
              htmlFor="emailInvoiceBody"
              error={errors?.emailInvoiceBody}
            >
              <Textarea
                id="emailInvoiceBody"
                name="emailInvoiceBody"
                rows={6}
                defaultValue={v("emailInvoiceBody", profile?.emailInvoiceBody)}
              />
            </Field>
            <Field
              label={t("creditNoteBody")}
              htmlFor="emailCreditNoteBody"
              error={errors?.emailCreditNoteBody}
            >
              <Textarea
                id="emailCreditNoteBody"
                name="emailCreditNoteBody"
                rows={6}
                defaultValue={v("emailCreditNoteBody", profile?.emailCreditNoteBody)}
              />
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>{t("artworkTitle")}</CardTitle>
            <CardDescription>{t("artworkDescription")}</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 md:grid-cols-3">
            <AssetPicker
              name="logoAssetId"
              kind="LOGO"
              label={t("logo")}
              assetId={profile?.logoAssetId}
              assetKey={profile?.logoKey}
            />
            <AssetPicker
              name="signatureAssetId"
              kind="SIGNATURE"
              label={t("signature")}
              assetId={profile?.signatureAssetId}
              assetKey={profile?.signatureKey}
              hint={t("transparentPng")}
            />
            <AssetPicker
              name="stampAssetId"
              kind="STAMP"
              label={t("stamp")}
              assetId={profile?.stampAssetId}
              assetKey={profile?.stampKey}
              hint={t("transparentPng")}
            />
          </div>
        </CardContent>
      </Card>

      {/* Per-profile template override is edited in Settings → Templates; preserve it here. */}
      <input
        type="hidden"
        name="templateConfigOverrideJson"
        value={
          profile?.templateConfigOverride ? JSON.stringify(profile.templateConfigOverride) : ""
        }
      />

      <div className="flex items-center gap-2">
        <SubmitButton pendingLabel={tc("saving")}>{t("save")}</SubmitButton>
        <Button asChild variant="tertiary">
          <Link href="/settings/profiles">{tc("cancel")}</Link>
        </Button>
      </div>
    </form>
  );
}
