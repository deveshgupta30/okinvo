import { describe, expect, it } from "vitest";
import { profilePrefill } from "@/lib/onboarding/prefill";
import { OnboardingStep1Schema, OnboardingStep2Schema } from "@/lib/schemas/onboarding-input";

describe("onboarding schemas", () => {
  it("step 1 needs a name, a country and a currency", () => {
    expect(
      OnboardingStep1Schema.parse({ name: " Asha ", countryCode: "in", currency: "INR" }),
    ).toEqual({
      name: "Asha",
      countryCode: "IN",
      currency: "INR",
    });
    expect(
      OnboardingStep1Schema.safeParse({ name: "", countryCode: "IN", currency: "INR" }).success,
    ).toBe(false);
  });
  it("step 2 validates the tax id for the country when the person says they have one", () => {
    const ok = OnboardingStep2Schema.parse({
      usage: "BUSINESS",
      hasTaxId: "on",
      taxId: " 27aapfu0939f1zv",
      countryCode: "IN",
    });
    expect(ok).toMatchObject({ usage: "BUSINESS", hasTaxId: true, taxId: "27AAPFU0939F1ZV" });
    expect(
      OnboardingStep2Schema.safeParse({
        usage: "BUSINESS",
        hasTaxId: "on",
        taxId: "29ABCDE1234F1Z5",
        countryCode: "IN",
      }).success,
    ).toBe(false);
    expect(
      OnboardingStep2Schema.parse({
        usage: "PERSONAL",
        hasTaxId: "on",
        taxId: "GB 123 4567 82",
        countryCode: "GB",
      }).taxId,
    ).toBe("GB123456782");
    // no tax id claimed: the field is ignored even if filled
    expect(
      OnboardingStep2Schema.parse({ usage: "PERSONAL", taxId: "junk", countryCode: "IN" }),
    ).toMatchObject({
      hasTaxId: false,
      taxId: undefined,
    });
  });
});

describe("profilePrefill", () => {
  const base = {
    name: "Asha Rao",
    email: "asha@example.com",
    countryCode: "IN",
    currency: "INR",
    locale: "en-US",
    usage: "BUSINESS" as const,
  };
  it("builds an Indian company profile with GST defaults and the GSTIN", () => {
    expect(profilePrefill(base, "27AAPFU0939F1ZV")).toEqual({
      type: "COMPANY",
      label: "Main",
      legalName: "Asha Rao",
      email: "asha@example.com",
      countryCode: "IN",
      baseCurrency: "INR",
      locale: "en-IN",
      defaultTaxRegime: "INDIA_GST",
      gstin: "27AAPFU0939F1ZV",
      ukVatNumber: "",
    });
  });
  it("maps the UK, the US and elsewhere to their regimes and document locales", () => {
    expect(
      profilePrefill(
        { ...base, countryCode: "GB", currency: "GBP", usage: "PERSONAL" },
        "GB123456782",
      ),
    ).toMatchObject({
      type: "INDIVIDUAL",
      locale: "en-GB",
      defaultTaxRegime: "UK_VAT",
      ukVatNumber: "GB123456782",
      gstin: "",
    });
    expect(profilePrefill({ ...base, countryCode: "US", currency: "USD" }, null)).toMatchObject({
      locale: "en-US",
      defaultTaxRegime: "US_SALES_TAX",
    });
    expect(profilePrefill({ ...base, countryCode: "DE", currency: "EUR" }, null)).toMatchObject({
      locale: "de-DE",
      defaultTaxRegime: "NONE",
    });
    expect(profilePrefill({ ...base, countryCode: "SG", currency: "SGD" }, null).locale).toBe(
      "en-SG",
    );
    expect(profilePrefill({ ...base, countryCode: "BR", currency: "BRL" }, null).locale).toBe(
      "en-US",
    );
  });
});
