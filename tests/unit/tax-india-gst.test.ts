import { describe, expect, it } from "vitest";
import { D } from "@/lib/money";
import {
  GST_RATES,
  SUPPLY_STATEMENTS,
  computeTax,
  type TaxContext,
  type TaxableLine,
} from "@/lib/tax";

const fy = "2026-27";

function ctx(overrides: Partial<TaxContext> = {}): TaxContext {
  return {
    regime: "INDIA_GST",
    currency: "INR",
    fiscalYear: fy,
    isReverseCharge: false,
    issuer: { countryCode: "IN", gstStateCode: "29", gstin: "29ABCDE1234F1Z5" },
    client: { countryCode: "IN", gstStateCode: "29" },
    ...overrides,
  };
}

function line(position: number, taxable: string, rate: string): TaxableLine {
  return { position, taxableAmount: D(taxable), taxRate: D(rate) };
}

/** Compact view of a tax result for rupee-exact assertions. */
function summary(result: ReturnType<typeof computeTax>) {
  return {
    supplyType: result.supplyType,
    lines: result.lines.map((l) => [l.position, l.taxAmount.toFixed(2)]),
    taxLines: result.taxLines.map((t) => [
      t.taxType,
      t.rate.toString(),
      t.taxableAmount.toFixed(2),
      t.taxAmount.toFixed(2),
    ]),
    statement: result.statement,
    placeOfSupplyRequired: result.placeOfSupplyRequired,
  };
}

describe("India GST — intra-state (CGST + SGST)", () => {
  it("10 × 1000 @ 18 % → CGST 900 / SGST 900", () => {
    const r = computeTax(ctx(), [line(1, "10000", "18")]);
    expect(summary(r)).toEqual({
      supplyType: "INTRA_STATE",
      lines: [[1, "1800.00"]],
      taxLines: [
        ["CGST", "9", "10000.00", "900.00"],
        ["SGST", "9", "10000.00", "900.00"],
      ],
      statement: undefined,
      placeOfSupplyRequired: true,
    });
  });

  it("1 × 333.33 @ 18 % → 30.00 / 30.00 (29.9997 rounds half-up per component)", () => {
    const r = computeTax(ctx(), [line(1, "333.33", "18")]);
    expect(r.taxLines.map((t) => t.taxAmount.toFixed(2))).toEqual(["30.00", "30.00"]);
    expect(r.lines[0]?.taxAmount.toFixed(2)).toBe("60.00");
  });

  it("1 × 0.30 @ 5 % → 0.01 / 0.01 (0.0075 rounds up per component)", () => {
    const r = computeTax(ctx(), [line(1, "0.30", "5")]);
    expect(r.taxLines.map((t) => [t.taxType, t.rate.toString(), t.taxAmount.toFixed(2)])).toEqual([
      ["CGST", "2.5", "0.01"],
      ["SGST", "2.5", "0.01"],
    ]);
    expect(r.lines[0]?.taxAmount.toFixed(2)).toBe("0.02");
  });

  it("1 × 0.10 @ 5 % → 0 / 0 (0.0025 rounds down)", () => {
    const r = computeTax(ctx(), [line(1, "0.10", "5")]);
    expect(r.taxLines.map((t) => t.taxAmount.toFixed(2))).toEqual(["0.00", "0.00"]);
    expect(r.lines[0]?.taxAmount.isZero()).toBe(true);
  });

  it("mixed rates 18 and 12 aggregate into four tax lines in first-seen order", () => {
    const r = computeTax(ctx(), [
      line(1, "10000", "18"),
      line(2, "5000", "12"),
      line(3, "2000", "18"),
    ]);
    expect(summary(r).taxLines).toEqual([
      ["CGST", "9", "12000.00", "1080.00"],
      ["SGST", "9", "12000.00", "1080.00"],
      ["CGST", "6", "5000.00", "300.00"],
      ["SGST", "6", "5000.00", "300.00"],
    ]);
    expect(summary(r).lines).toEqual([
      [1, "1800.00"],
      [2, "600.00"],
      [3, "360.00"],
    ]);
  });

  it("a 0 % line still produces 0-amount CGST/SGST lines so summaries show the 0 % row", () => {
    const r = computeTax(ctx(), [line(1, "1000", "0"), line(2, "1000", "18")]);
    expect(summary(r).taxLines).toEqual([
      ["CGST", "0", "1000.00", "0.00"],
      ["SGST", "0", "1000.00", "0.00"],
      ["CGST", "9", "1000.00", "90.00"],
      ["SGST", "9", "1000.00", "90.00"],
    ]);
  });

  it("totals are sums of the rounded per-line components, so the table foots", () => {
    const r = computeTax(ctx(), [line(1, "0.30", "5"), line(2, "0.30", "5"), line(3, "0.30", "5")]);
    // 3 × 0.0075 = 0.0225 would round to 0.02 if aggregated first; per-line rounding gives 0.03.
    expect(r.taxLines.map((t) => t.taxAmount.toFixed(2))).toEqual(["0.03", "0.03"]);
  });
});

describe("India GST — inter-state (IGST)", () => {
  const inter = ctx({ client: { countryCode: "IN", gstStateCode: "07" } });

  it("1 × 0.30 @ 5 % → IGST 0.02 (0.015 rounds half-up on the whole rate)", () => {
    const r = computeTax(inter, [line(1, "0.30", "5")]);
    expect(summary(r)).toEqual({
      supplyType: "INTER_STATE",
      lines: [[1, "0.02"]],
      taxLines: [["IGST", "5", "0.30", "0.02"]],
      statement: undefined,
      placeOfSupplyRequired: true,
    });
  });

  it("10000 @ 18 → IGST 1800", () => {
    const r = computeTax(inter, [line(1, "10000", "18")]);
    expect(summary(r).taxLines).toEqual([["IGST", "18", "10000.00", "1800.00"]]);
  });

  it("treats a missing client state as inter-state rather than matching a missing issuer state", () => {
    const r = computeTax(ctx({ client: { countryCode: "IN", gstStateCode: null } }), [
      line(1, "100", "18"),
    ]);
    expect(r.supplyType).toBe("INTER_STATE");
    const both = computeTax(
      ctx({
        issuer: { countryCode: "IN", gstin: "29ABCDE1234F1Z5", gstStateCode: null },
        client: { countryCode: "IN" },
      }),
      [line(1, "100", "18")],
    );
    expect(both.supplyType).toBe("INTER_STATE");
  });
});

describe("India GST — exports", () => {
  const abroad = { countryCode: "US" };

  it("with a LUT for the current FY → EXPORT_LUT, no tax lines, statement", () => {
    const r = computeTax(
      ctx({
        issuer: {
          countryCode: "IN",
          gstStateCode: "29",
          gstin: "29ABCDE1234F1Z5",
          lutNumber: "AD290326000123X",
          lutFiscalYear: fy,
        },
        client: abroad,
      }),
      [line(1, "10000", "18"), line(2, "500", "0")],
    );
    expect(summary(r)).toEqual({
      supplyType: "EXPORT_LUT",
      lines: [
        [1, "0.00"],
        [2, "0.00"],
      ],
      taxLines: [],
      statement: SUPPLY_STATEMENTS.EXPORT_LUT,
      placeOfSupplyRequired: true,
    });
    expect(r.statement).toBe("Supply meant for export under LUT without payment of IGST");
  });

  it("with a LUT for another FY → EXPORT_WITH_TAX with IGST", () => {
    const r = computeTax(
      ctx({
        issuer: {
          countryCode: "IN",
          gstStateCode: "29",
          gstin: "29ABCDE1234F1Z5",
          lutNumber: "AD290326000123X",
          lutFiscalYear: "2025-26",
        },
        client: abroad,
      }),
      [line(1, "10000", "18")],
    );
    expect(summary(r)).toEqual({
      supplyType: "EXPORT_WITH_TAX",
      lines: [[1, "1800.00"]],
      taxLines: [["IGST", "18", "10000.00", "1800.00"]],
      statement: "Supply meant for export on payment of IGST",
      placeOfSupplyRequired: true,
    });
  });

  it("without a LUT → EXPORT_WITH_TAX", () => {
    const r = computeTax(ctx({ client: abroad }), [line(1, "10000", "18")]);
    expect(r.supplyType).toBe("EXPORT_WITH_TAX");
    expect(r.statement).toBe(SUPPLY_STATEMENTS.EXPORT_WITH_TAX);
  });
});

describe("India GST — reverse charge and unregistered issuer", () => {
  it("reverse charge → REVERSE_CHARGE, no tax lines, statement", () => {
    const r = computeTax(ctx({ isReverseCharge: true }), [line(1, "10000", "18")]);
    expect(summary(r)).toEqual({
      supplyType: "REVERSE_CHARGE",
      lines: [[1, "0.00"]],
      taxLines: [],
      statement: "Tax payable on reverse charge basis",
      placeOfSupplyRequired: true,
    });
  });

  it("no GSTIN → NOT_APPLICABLE, no tax lines, statement, no place of supply", () => {
    const r = computeTax(ctx({ issuer: { countryCode: "IN", gstStateCode: "29", gstin: null } }), [
      line(1, "10000", "18"),
    ]);
    expect(summary(r)).toEqual({
      supplyType: "NOT_APPLICABLE",
      lines: [[1, "0.00"]],
      taxLines: [],
      statement: "Not registered under GST",
      placeOfSupplyRequired: false,
    });
  });

  it("a blank GSTIN counts as no GSTIN and wins over reverse charge", () => {
    const r = computeTax(
      ctx({ isReverseCharge: true, issuer: { countryCode: "IN", gstin: "  " } }),
      [line(1, "10000", "18")],
    );
    expect(r.supplyType).toBe("NOT_APPLICABLE");
  });

  it("reverse charge wins over export determination", () => {
    const r = computeTax(ctx({ isReverseCharge: true, client: { countryCode: "GB" } }), [
      line(1, "10000", "18"),
    ]);
    expect(r.supplyType).toBe("REVERSE_CHARGE");
  });
});

describe("India GST — constants", () => {
  it("exposes the selectable GST rates", () => {
    expect(GST_RATES).toEqual(["0", "5", "12", "18", "28"]);
  });
  it("returns no lines for no input", () => {
    const r = computeTax(ctx(), []);
    expect(r.lines).toEqual([]);
    expect(r.taxLines).toEqual([]);
  });
});
