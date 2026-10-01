import { describe, expect, it } from "vitest";
import { COMMON_CURRENCIES, CurrencySchema } from "@/lib/schemas/currency";

describe("CurrencySchema", () => {
  it("accepts and upper-cases ISO 4217 codes with 0 or 2 minor units", () => {
    expect(CurrencySchema.parse("inr")).toBe("INR");
    expect(CurrencySchema.parse("JPY")).toBe("JPY");
  });
  it("rejects the seven three-decimal currencies with a clear message", () => {
    for (const code of ["BHD", "IQD", "JOD", "KWD", "LYD", "OMR", "TND"]) {
      const r = CurrencySchema.safeParse(code);
      expect(r.success).toBe(false);
      expect(JSON.stringify(r.error?.issues)).toContain(
        "three-decimal currencies are not supported",
      );
    }
  });
  it("rejects unknown codes and wrong lengths", () => {
    expect(CurrencySchema.safeParse("XYZ").success).toBe(false);
    expect(CurrencySchema.safeParse("IN").success).toBe(false);
    expect(CurrencySchema.safeParse("").success).toBe(false);
  });
  it("lists the common currencies with INR first", () => {
    expect(COMMON_CURRENCIES[0]).toBe("INR");
    expect(COMMON_CURRENCIES).toContain("JPY");
    for (const c of COMMON_CURRENCIES) expect(CurrencySchema.safeParse(c).success).toBe(true);
  });
});
