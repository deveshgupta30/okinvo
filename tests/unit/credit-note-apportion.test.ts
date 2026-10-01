import { describe, expect, it } from "vitest";
import { creditNoteTaxLines } from "@/lib/credit-notes/apportion";
import { D } from "@/lib/money";
import type { TaxType } from "@/lib/tax";

function taxLine(taxType: TaxType, rate: string, taxableAmount: string) {
  return { taxType, rate: D(rate), taxableAmount: D(taxableAmount) };
}

/** Mixed-rate intra-state invoice: 10000 @ 18 % and 5000 @ 12 %. */
const mixed = [
  taxLine("CGST", "9", "10000"),
  taxLine("SGST", "9", "10000"),
  taxLine("CGST", "6", "5000"),
  taxLine("SGST", "6", "5000"),
];

describe("creditNoteTaxLines", () => {
  // The plan's Task 4 fixture expects parts [333.33, 333.33, 166.67, 166.67] / total 1080.00 by
  // apportioning across all four lines at once. That spreads the credit over 30000 of "taxable"
  // (CGST and SGST each carry the same 15000 base) and halves the tax: a full 15000 credit would
  // carry 1200 of tax against the invoice's 2400. Apportioning within each tax type is the
  // SPEC §4.9 pro-rata the plan intends, and makes a full credit reproduce the invoice's tax.
  it("credit 1000 on the mixed-rate invoice → parts [666.67, 666.67, 333.33, 333.33], tax [60, 60, 20, 20], total 1160", () => {
    const r = creditNoteTaxLines(mixed, D("1000"), "INR");
    expect(
      r.taxLines.map((t) => [
        t.taxType,
        t.rate.toString(),
        t.taxableAmount.toFixed(2),
        t.taxAmount.toFixed(2),
      ]),
    ).toEqual([
      ["CGST", "9", "666.67", "60.00"],
      ["SGST", "9", "666.67", "60.00"],
      ["CGST", "6", "333.33", "20.00"],
      ["SGST", "6", "333.33", "20.00"],
    ]);
    expect(r.taxAmount.toFixed(2)).toBe("160.00");
    expect(r.total.toFixed(2)).toBe("1160.00");
  });

  it("the taxable parts of each tax type sum exactly to the credit amount (largest remainder)", () => {
    const r = creditNoteTaxLines(mixed, D("0.05"), "INR");
    const parts = r.taxLines.map((t) => t.taxableAmount.toFixed(2));
    expect(parts).toEqual(["0.03", "0.03", "0.02", "0.02"]);
    for (const type of ["CGST", "SGST"] as const) {
      const ofType = r.taxLines.filter((t) => t.taxType === type).map((t) => t.taxableAmount);
      expect(ofType.reduce((a, b) => a.plus(b)).toFixed(2)).toBe("0.05");
    }
  });

  it("a partial credit carries the invoice's effective tax rate", () => {
    // invoice: 15000 taxable, 2400 tax (16 %); a 10 % credit → 1500 + 240
    const r = creditNoteTaxLines(mixed, D("1500"), "INR");
    expect(r.taxAmount.toFixed(2)).toBe("240.00");
    expect(r.total.toFixed(2)).toBe("1740.00");
  });

  it("a full credit reproduces the invoice's tax", () => {
    const r = creditNoteTaxLines(mixed, D("15000"), "INR");
    expect(r.taxLines.map((t) => t.taxAmount.toFixed(2))).toEqual([
      "900.00",
      "900.00",
      "300.00",
      "300.00",
    ]);
    expect(r.taxAmount.toFixed(2)).toBe("2400.00");
    expect(r.total.toFixed(2)).toBe("17400.00");
  });

  it("keeps 0 % lines with zero tax", () => {
    const r = creditNoteTaxLines(
      [taxLine("IGST", "0", "1000"), taxLine("IGST", "18", "1000")],
      D("100"),
      "INR",
    );
    expect(r.taxLines.map((t) => [t.taxableAmount.toFixed(2), t.taxAmount.toFixed(2)])).toEqual([
      ["50.00", "0.00"],
      ["50.00", "9.00"],
    ]);
    expect(r.total.toFixed(2)).toBe("109.00");
  });

  it("an invoice without tax lines yields a credit note of just the amount", () => {
    const r = creditNoteTaxLines([], D("250"), "INR");
    expect(r.taxLines).toEqual([]);
    expect(r.taxAmount.isZero()).toBe(true);
    expect(r.total.toFixed(2)).toBe("250.00");
  });

  it("rounds per tax line to the currency's minor units (JPY)", () => {
    const r = creditNoteTaxLines([taxLine("SALES_TAX", "8.25", "999")], D("999"), "JPY");
    expect(r.taxLines[0]?.taxAmount.toString()).toBe("82");
    expect(r.total.toString()).toBe("1081");
  });

  it("rejects a negative credit amount", () => {
    expect(() => creditNoteTaxLines(mixed, D("-1"), "INR")).toThrow(/credit/i);
  });
});
