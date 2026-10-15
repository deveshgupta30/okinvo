import { describe, expect, it } from "vitest";
import { isValidGbVat, normaliseGbVat } from "@/lib/tax/vat-gb";

describe("UK VAT number", () => {
  it("accepts nine digits that pass the mod-97 (or mod-9755) check, with or without GB and spaces", () => {
    expect(isValidGbVat("123456782")).toBe(true);
    expect(isValidGbVat("GB 123 4567 82")).toBe(true);
    expect(isValidGbVat("gb123456782")).toBe(true);
  });
  it("accepts a twelve-digit branch number whose first nine digits validate", () => {
    expect(isValidGbVat("GB 123 4567 82 001")).toBe(true);
  });
  it("rejects wrong checksums and shapes", () => {
    expect(isValidGbVat("123456789")).toBe(false);
    expect(isValidGbVat("GB 100 0000 00")).toBe(false);
    expect(isValidGbVat("12345678")).toBe(false);
    expect(isValidGbVat("")).toBe(false);
    expect(isValidGbVat("ABC")).toBe(false);
  });
  it("normalises to GB + digits", () => {
    expect(normaliseGbVat(" gb 123 4567 82 ")).toBe("GB123456782");
  });
});
