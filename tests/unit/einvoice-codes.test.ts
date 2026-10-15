import { describe, expect, it } from "vitest";
import { paymentMeansCode, taxCategory, unitCode, vatExemptionReason } from "@/lib/einvoice/codes";

/** EN 16931 code lists (spec §9e): UN/ECE Rec 20 units, UNCL 5305 VAT categories, VATEX reasons. */
describe("unitCode", () => {
  it("maps the service units to Rec 20 codes and everything else to C62", () => {
    expect(unitCode("HOUR")).toBe("HUR");
    expect(unitCode("DAY")).toBe("DAY");
    expect(unitCode("UNIT")).toBe("C62");
    expect(unitCode("FIXED")).toBe("C62");
    expect(unitCode("MILESTONE")).toBe("C62");
  });
});

describe("taxCategory", () => {
  const base = {
    regime: "UK_VAT" as const,
    rate: "20",
    exempt: false,
    reverseCharge: false,
    exportUnderLut: false,
  };
  it("is S for a taxed line and Z for a zero-rated one", () => {
    expect(taxCategory(base)).toBe("S");
    expect(taxCategory({ ...base, rate: "0" })).toBe("Z");
    expect(taxCategory({ ...base, rate: "0.00" })).toBe("Z");
  });
  it("is E for exempt, AE for reverse charge, G for an export under LUT, O without a regime", () => {
    expect(taxCategory({ ...base, exempt: true })).toBe("E");
    expect(taxCategory({ ...base, reverseCharge: true, exempt: true })).toBe("AE");
    expect(taxCategory({ ...base, regime: "INDIA_GST", rate: "0", exportUnderLut: true })).toBe(
      "G",
    );
    expect(taxCategory({ ...base, regime: "NONE", rate: "0" })).toBe("O");
  });
});

describe("vatExemptionReason", () => {
  it("gives a VATEX code only to the categories that need one", () => {
    expect(vatExemptionReason("S")).toBeUndefined();
    expect(vatExemptionReason("Z")).toBeUndefined();
    expect(vatExemptionReason("AE")?.code).toBe("VATEX-EU-AE");
    expect(vatExemptionReason("G")?.code).toBe("VATEX-EU-G");
    expect(vatExemptionReason("E")?.code).toBe("VATEX-EU-132");
    expect(vatExemptionReason("O")?.code).toBe("VATEX-EU-O");
  });
});

describe("paymentMeansCode", () => {
  it("is a SEPA credit transfer with an IBAN and a plain credit transfer without", () => {
    expect(paymentMeansCode(true)).toBe("58");
    expect(paymentMeansCode(false)).toBe("30");
  });
});
