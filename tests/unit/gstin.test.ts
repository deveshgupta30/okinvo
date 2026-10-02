import { describe, expect, it } from "vitest";
import { gstinCheckDigit, isValidGstin, normaliseGstin } from "@/lib/tax/gstin";

describe("GSTIN", () => {
  it("accepts well-formed numbers with the right check digit", () => {
    expect(isValidGstin("27AAPFU0939F1ZV")).toBe(true);
    expect(isValidGstin("29ABCDE1234F1ZW")).toBe(true);
    expect(isValidGstin(" 07aabcu9603r1zp ")).toBe(true); // normalised: trimmed, upper-cased
  });
  it("rejects a wrong check digit, a bad shape and the sample used in fixtures", () => {
    expect(isValidGstin("27AAPFU0939F1ZA")).toBe(false);
    expect(isValidGstin("29ABCDE1234F1Z5")).toBe(false); // the seed's placeholder
    expect(isValidGstin("27AAPFU0939F1Z")).toBe(false); // 14 chars
    expect(isValidGstin("27AAPFU0939F1XV")).toBe(false); // 14th char must be Z
    expect(isValidGstin("2AAAPFU0939F1ZV")).toBe(false); // state code must be digits
    expect(isValidGstin("")).toBe(false);
  });
  it("computes the mod-36 check digit", () => {
    expect(gstinCheckDigit("27AAPFU0939F1Z")).toBe("V");
    expect(gstinCheckDigit("29ABCDE1234F1Z")).toBe("W");
    expect(normaliseGstin(" 27aapfu0939f1zv")).toBe("27AAPFU0939F1ZV");
  });
});
