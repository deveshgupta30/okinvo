import { describe, expect, it } from "vitest";
import { D } from "@/lib/money";
import {
  SUPPLY_STATEMENTS,
  UK_VAT_RATES,
  computeTax,
  type TaxContext,
  type TaxableLine,
} from "@/lib/tax";

function line(position: number, taxable: string, rate: string): TaxableLine {
  return { position, taxableAmount: D(taxable), taxRate: D(rate) };
}

function view(result: ReturnType<typeof computeTax>) {
  return {
    supplyType: result.supplyType,
    lines: result.lines.map((l) => [l.position, l.taxAmount.toString()]),
    taxLines: result.taxLines.map((t) => [
      t.taxType,
      t.rate.toString(),
      t.taxableAmount.toString(),
      t.taxAmount.toString(),
    ]),
    statement: result.statement,
    placeOfSupplyRequired: result.placeOfSupplyRequired,
  };
}

describe("UK VAT", () => {
  const uk: TaxContext = {
    regime: "UK_VAT",
    currency: "GBP",
    fiscalYear: "2026",
    isReverseCharge: false,
    issuer: { countryCode: "GB", ukVatNumber: "GB123456789" },
    client: { countryCode: "GB" },
  };

  it("charges VAT at the line rate, aggregated per rate, including a 0 % row", () => {
    const r = computeTax(uk, [line(1, "1000", "20"), line(2, "200", "5"), line(3, "50", "0")]);
    expect(view(r)).toEqual({
      supplyType: "NOT_APPLICABLE",
      lines: [
        [1, "200"],
        [2, "10"],
        [3, "0"],
      ],
      taxLines: [
        ["VAT", "20", "1000", "200"],
        ["VAT", "5", "200", "10"],
        ["VAT", "0", "50", "0"],
      ],
      statement: undefined,
      placeOfSupplyRequired: false,
    });
  });

  it("rounds half-up per line to pence: 0.03 @ 20 % → 0.01", () => {
    const r = computeTax(uk, [line(1, "0.03", "20")]);
    expect(r.taxLines[0]?.taxAmount.toFixed(2)).toBe("0.01");
  });

  it("reverse charge → REVERSE_CHARGE with the UK statement and no tax lines", () => {
    const r = computeTax({ ...uk, isReverseCharge: true, client: { countryCode: "DE" } }, [
      line(1, "1000", "20"),
    ]);
    expect(view(r)).toEqual({
      supplyType: "REVERSE_CHARGE",
      lines: [[1, "0"]],
      taxLines: [],
      statement: "Reverse charge: customer to account for VAT",
      placeOfSupplyRequired: false,
    });
    expect(r.statement).toBe(SUPPLY_STATEMENTS.UK_REVERSE_CHARGE);
  });

  it("exposes the selectable UK rates", () => {
    expect(UK_VAT_RATES).toEqual(["20", "5", "0"]);
  });
});

describe("US sales tax", () => {
  const us: TaxContext = {
    regime: "US_SALES_TAX",
    currency: "USD",
    fiscalYear: "2026",
    isReverseCharge: false,
    issuer: { countryCode: "US" },
    client: { countryCode: "US" },
  };

  it("charges SALES_TAX at the line rate", () => {
    const r = computeTax(us, [line(1, "100", "8.25"), line(2, "200", "8.25")]);
    expect(view(r)).toEqual({
      supplyType: "NOT_APPLICABLE",
      lines: [
        [1, "8.25"],
        [2, "16.5"],
      ],
      taxLines: [["SALES_TAX", "8.25", "300", "24.75"]],
      statement: undefined,
      placeOfSupplyRequired: false,
    });
  });

  it("8.25 % on JPY 999 → 82 (82.4175 rounds to zero minor units)", () => {
    const r = computeTax({ ...us, currency: "JPY" }, [line(1, "999", "8.25")]);
    expect(r.lines[0]?.taxAmount.toString()).toBe("82");
    expect(r.taxLines).toHaveLength(1);
    expect(r.taxLines[0]?.taxAmount.toString()).toBe("82");
  });

  it("ignores the reverse-charge flag (no reverse charge in US sales tax)", () => {
    const r = computeTax({ ...us, isReverseCharge: true }, [line(1, "100", "8.25")]);
    expect(r.supplyType).toBe("NOT_APPLICABLE");
    expect(r.taxLines[0]?.taxAmount.toString()).toBe("8.25");
  });
});

describe("NONE", () => {
  it("produces no tax lines and zero line tax regardless of rates", () => {
    const r = computeTax(
      {
        regime: "NONE",
        currency: "EUR",
        fiscalYear: "2026",
        isReverseCharge: true,
        issuer: { countryCode: "DE" },
        client: { countryCode: "FR" },
      },
      [line(1, "1000", "18"), line(2, "50", "0")],
    );
    expect(view(r)).toEqual({
      supplyType: "NOT_APPLICABLE",
      lines: [
        [1, "0"],
        [2, "0"],
      ],
      taxLines: [],
      statement: undefined,
      placeOfSupplyRequired: false,
    });
  });
});

describe("statements", () => {
  it("carries the five printed statements verbatim", () => {
    expect(SUPPLY_STATEMENTS).toEqual({
      EXPORT_LUT: "Supply meant for export under LUT without payment of IGST",
      EXPORT_WITH_TAX: "Supply meant for export on payment of IGST",
      REVERSE_CHARGE: "Tax payable on reverse charge basis",
      NOT_APPLICABLE: "Not registered under GST",
      UK_REVERSE_CHARGE: "Reverse charge: customer to account for VAT",
    });
  });
});
