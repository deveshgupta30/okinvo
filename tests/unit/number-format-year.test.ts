import { describe, expect, it } from "vitest";
import { NumberFormatSchema } from "@/lib/numbering";
import { ProfileInputSchema } from "@/lib/schemas/profile-input";

/**
 * Sequences reset every fiscal year, so a format without a year token repeats its numbers in the
 * next year and the unique (issuer, number) constraint stops issuing altogether (review finding).
 */
describe("number formats need a year token", () => {
  it("rejects a format with only a sequence", () => {
    const r = NumberFormatSchema.safeParse("INV-{SEQ:4}");
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toMatch(/\{FY\}|year/i);
  });
  it("accepts any of {FY}, {FYYYY}, {YYYY}, {YY}", () => {
    for (const f of ["INV/{FY}/{SEQ:3}", "{FYYYY}-{SEQ}", "{YYYY}{MM}-{SEQ:4}", "{YY}-{SEQ:2}"]) {
      expect(NumberFormatSchema.safeParse(f).success).toBe(true);
    }
  });
});

describe("ProfileInputSchema ties calendar-year formats to a January fiscal year", () => {
  const base = {
    type: "INDIVIDUAL",
    label: "L",
    legalName: "Legal",
    email: "me@example.com",
    address: { line1: "1 Street", city: "Town", countryCode: "IN" },
    countryCode: "IN",
    baseCurrency: "INR",
    locale: "en-IN",
    creditNoteNumberFormat: "CN/{FY}/{SEQ:3}",
    defaultTaxRegime: "NONE",
    emailCc: [],
    emailBcc: [],
  };
  it("rejects {YYYY} or {YY} when the fiscal year does not start in January", () => {
    const r = ProfileInputSchema.safeParse({
      ...base,
      fiscalYearStartMonth: 4,
      invoiceNumberFormat: "{YYYY}-{SEQ:3}",
    });
    expect(r.success).toBe(false);
    expect(r.error?.issues.map((i) => i.path.join("."))).toContain("invoiceNumberFormat");
  });
  it("accepts {YYYY} with a January start, and {FY} with any start", () => {
    expect(
      ProfileInputSchema.safeParse({
        ...base,
        fiscalYearStartMonth: 1,
        invoiceNumberFormat: "{YYYY}-{SEQ:3}",
      }).success,
    ).toBe(true);
    expect(
      ProfileInputSchema.safeParse({
        ...base,
        fiscalYearStartMonth: 4,
        invoiceNumberFormat: "INV/{FY}/{SEQ:3}",
      }).success,
    ).toBe(true);
  });
});
