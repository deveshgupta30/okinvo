"use client";

import Link from "next/link";
import { useActionState } from "react";
import { AddressFields } from "@/components/forms/address-fields";
import { AssetPicker } from "@/components/forms/asset-picker";
import { CountryStateFields } from "@/components/forms/country-state-fields";
import { DisplayConfigFields } from "@/components/forms/display-config-fields";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PLACEHOLDER_HELP } from "@/lib/email/templates";
import { COMMON_CURRENCIES, DEFAULT_DISPLAY_CONFIG, TAX_REGIMES } from "@/lib/schemas";
import { LOCALES } from "@/lib/schemas/profile-input";
import { saveProfile } from "@/server/actions/profiles";
import type { ProfileDto } from "@/server/dal/profiles";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const REGIME_LABELS: Record<(typeof TAX_REGIMES)[number], string> = {
  INDIA_GST: "India GST",
  UK_VAT: "UK VAT",
  US_SALES_TAX: "US sales tax",
  NONE: "No tax",
};

export function ProfileForm({
  profile,
  prefill,
}: {
  profile: ProfileDto | null;
  /** First-run defaults from onboarding (spec §4.2); only used for a new profile. */
  prefill?: Partial<Record<string, string>> | undefined;
}) {
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
            <CardTitle>Identity</CardTitle>
            <CardDescription>Who the invoice is from.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field label="Type" htmlFor="type" error={errors?.type} required>
              <Select id="type" name="type" defaultValue={v("type", profile?.type ?? "INDIVIDUAL")}>
                <option value="INDIVIDUAL">Individual</option>
                <option value="COMPANY">Company</option>
              </Select>
            </Field>
            <Field
              label="Label"
              htmlFor="label"
              error={errors?.label}
              hint="Shown in pickers only"
              required
            >
              <Input id="label" name="label" defaultValue={v("label", profile?.label)} />
            </Field>
            <Field label="Legal name" htmlFor="legalName" error={errors?.legalName} required>
              <Input
                id="legalName"
                name="legalName"
                defaultValue={v("legalName", profile?.legalName)}
              />
            </Field>
            <Field label="Trade name" htmlFor="tradeName" error={errors?.tradeName}>
              <Input
                id="tradeName"
                name="tradeName"
                defaultValue={v("tradeName", profile?.tradeName)}
              />
            </Field>
            <Field label="Designation" htmlFor="designation" error={errors?.designation}>
              <Input
                id="designation"
                name="designation"
                defaultValue={v("designation", profile?.designation)}
              />
            </Field>
            <Field label="Email" htmlFor="email" error={errors?.email} required>
              <Input
                id="email"
                name="email"
                type="email"
                defaultValue={v("email", profile?.email)}
              />
            </Field>
            <Field label="Phone" htmlFor="phone" error={errors?.phone}>
              <Input id="phone" name="phone" defaultValue={v("phone", profile?.phone)} />
            </Field>
            <Field label="Website" htmlFor="website" error={errors?.website}>
              <Input id="website" name="website" defaultValue={v("website", profile?.website)} />
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Address</CardTitle>
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
            <CardTitle>Tax identifiers</CardTitle>
            <CardDescription>
              Only the ones that apply to you; printing is controlled per invoice.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field label="PAN" htmlFor="panNumber" error={errors?.panNumber}>
              <Input
                id="panNumber"
                name="panNumber"
                className="font-mono uppercase"
                defaultValue={v("panNumber", profile?.panNumber)}
              />
            </Field>
            <Field label="GSTIN" htmlFor="gstin" error={errors?.gstin}>
              <Input
                id="gstin"
                name="gstin"
                className="font-mono uppercase"
                defaultValue={v("gstin", profile?.gstin)}
              />
            </Field>
            <Field label="CIN" htmlFor="cinNumber" error={errors?.cinNumber}>
              <Input
                id="cinNumber"
                name="cinNumber"
                className="font-mono"
                defaultValue={v("cinNumber", profile?.cinNumber)}
              />
            </Field>
            <Field label="UK VAT number" htmlFor="ukVatNumber" error={errors?.ukVatNumber}>
              <Input
                id="ukVatNumber"
                name="ukVatNumber"
                className="font-mono"
                defaultValue={v("ukVatNumber", profile?.ukVatNumber)}
              />
            </Field>
            <Field
              label="US EIN / SSN"
              htmlFor="usTaxId"
              error={errors?.usTaxId}
              hint="Encrypted at rest"
            >
              <Input
                id="usTaxId"
                name="usTaxId"
                className="font-mono"
                defaultValue={v("usTaxId", profile?.usTaxId)}
              />
            </Field>
            <Field
              label="LUT number"
              htmlFor="lutNumber"
              error={errors?.lutNumber}
              hint="For exports without IGST"
            >
              <Input
                id="lutNumber"
                name="lutNumber"
                className="font-mono"
                defaultValue={v("lutNumber", profile?.lutNumber)}
              />
            </Field>
            <Field
              label="LUT financial year"
              htmlFor="lutFiscalYear"
              error={errors?.lutFiscalYear}
              hint="e.g. 2026-27"
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
          <CardTitle>Defaults</CardTitle>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field
              label="Base currency"
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
              label="Document locale"
              htmlFor="locale"
              error={errors?.locale}
              hint="Number and date formatting on documents"
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
              label="Fiscal year starts in"
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
                    {m}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label="Default tax regime"
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
                    {REGIME_LABELS[r]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label="Invoice number format"
              htmlFor="invoiceNumberFormat"
              error={errors?.invoiceNumberFormat}
              hint="Tokens: {FY} {FYYYY} {YYYY} {YY} {MM} {SEQ} {SEQ:n}"
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
              label="Credit note number format"
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
              label="Expected TDS rate (%)"
              htmlFor="defaultTdsRate"
              error={errors?.defaultTdsRate}
              hint="Informational, printed as expected deduction"
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
          <Field label="Default notes" htmlFor="defaultNotes" error={errors?.defaultNotes}>
            <Textarea
              id="defaultNotes"
              name="defaultNotes"
              defaultValue={v("defaultNotes", profile?.defaultNotes)}
            />
          </Field>
          <Field label="Default terms" htmlFor="defaultTerms" error={errors?.defaultTerms}>
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
            <CardTitle>What prints by default</CardTitle>
            <CardDescription>
              Each invoice copies these and can change them individually.
            </CardDescription>
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
            <CardTitle>Email</CardTitle>
            <CardDescription>
              Defaults for the send composer. Placeholders:{" "}
              {PLACEHOLDER_HELP.map((p) => p.token).join(" ")}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field
              label="Default CC"
              htmlFor="emailCc"
              error={errors?.emailCc}
              hint="Comma-separated"
            >
              <Input
                id="emailCc"
                name="emailCc"
                defaultValue={v("emailCc", profile?.emailCc.join(", "))}
              />
            </Field>
            <Field
              label="Default BCC"
              htmlFor="emailBcc"
              error={errors?.emailBcc}
              hint="Comma-separated"
            >
              <Input
                id="emailBcc"
                name="emailBcc"
                defaultValue={v("emailBcc", profile?.emailBcc.join(", "))}
              />
            </Field>
            <Field
              label="Invoice subject"
              htmlFor="emailInvoiceSubject"
              error={errors?.emailInvoiceSubject}
              hint="Blank uses the built-in template"
            >
              <Input
                id="emailInvoiceSubject"
                name="emailInvoiceSubject"
                defaultValue={v("emailInvoiceSubject", profile?.emailInvoiceSubject)}
              />
            </Field>
            <Field
              label="Credit note subject"
              htmlFor="emailCreditNoteSubject"
              error={errors?.emailCreditNoteSubject}
            >
              <Input
                id="emailCreditNoteSubject"
                name="emailCreditNoteSubject"
                defaultValue={v("emailCreditNoteSubject", profile?.emailCreditNoteSubject)}
              />
            </Field>
            <Field label="Invoice body" htmlFor="emailInvoiceBody" error={errors?.emailInvoiceBody}>
              <Textarea
                id="emailInvoiceBody"
                name="emailInvoiceBody"
                rows={6}
                defaultValue={v("emailInvoiceBody", profile?.emailInvoiceBody)}
              />
            </Field>
            <Field
              label="Credit note body"
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
            <CardTitle>Artwork</CardTitle>
            <CardDescription>
              PNG, JPEG or WebP up to 2 MB; signature and stamp keep transparency.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 md:grid-cols-3">
            <AssetPicker
              name="logoAssetId"
              kind="LOGO"
              label="Logo"
              assetId={profile?.logoAssetId}
              assetKey={profile?.logoKey}
            />
            <AssetPicker
              name="signatureAssetId"
              kind="SIGNATURE"
              label="Signature"
              assetId={profile?.signatureAssetId}
              assetKey={profile?.signatureKey}
              hint="Transparent PNG"
            />
            <AssetPicker
              name="stampAssetId"
              kind="STAMP"
              label="Stamp"
              assetId={profile?.stampAssetId}
              assetKey={profile?.stampKey}
              hint="Transparent PNG"
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
        <SubmitButton pendingLabel="Saving…">Save profile</SubmitButton>
        <Button asChild variant="tertiary">
          <Link href="/settings/profiles">Cancel</Link>
        </Button>
      </div>
    </form>
  );
}
