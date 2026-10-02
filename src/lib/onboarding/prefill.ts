import { LOCALES, type Locale } from "@/lib/schemas/profile-input";
import type { TaxRegime } from "@/lib/tax";

export interface PrefillSource {
  name: string;
  email: string;
  countryCode: string | null;
  currency: string | null;
  locale: string;
  usage: "PERSONAL" | "BUSINESS" | null;
}

/** What the profile form receives after onboarding (spec §4.2, step 3). All values are strings. */
export interface ProfilePrefill {
  type: "INDIVIDUAL" | "COMPANY";
  label: string;
  legalName: string;
  email: string;
  countryCode: string;
  baseCurrency: string;
  locale: Locale;
  defaultTaxRegime: TaxRegime;
  gstin: string;
  ukVatNumber: string;
}

const REGIME_BY_COUNTRY: Record<string, TaxRegime> = {
  IN: "INDIA_GST",
  GB: "UK_VAT",
  US: "US_SALES_TAX",
};

/** A document locale the profile schema accepts: the user's own tag when listed, else by country. */
export function documentLocaleFor(country: string, userLocale: string): Locale {
  const byCountry: Record<string, Locale> = {
    IN: "en-IN",
    GB: "en-GB",
    US: "en-US",
    AU: "en-AU",
    CA: "en-CA",
    SG: "en-SG",
    AE: "en-AE",
    DE: "de-DE",
    FR: "fr-FR",
  };
  const fromCountry = byCountry[country];
  if (fromCountry) return fromCountry;
  return (LOCALES as readonly string[]).includes(userLocale) ? (userLocale as Locale) : "en-US";
}

export function profilePrefill(src: PrefillSource, taxId: string | null): ProfilePrefill {
  const country = src.countryCode ?? "IN";
  return {
    type: src.usage === "BUSINESS" ? "COMPANY" : "INDIVIDUAL",
    label: "Main",
    legalName: src.name,
    email: src.email,
    countryCode: country,
    baseCurrency: src.currency ?? "INR",
    locale: documentLocaleFor(country, src.locale),
    defaultTaxRegime: REGIME_BY_COUNTRY[country] ?? "NONE",
    gstin: country === "IN" ? (taxId ?? "") : "",
    ukVatNumber: country === "GB" ? (taxId ?? "") : "",
  };
}
