import { describe, expect, it } from "vitest";
import { D } from "@/lib/money";
import {
  computeLines,
  computeTotals,
  isValidRoundingAdjustment,
  suggestRoundingAdjustment,
  type TotalsInput,
} from "@/lib/invoices";
import { computeTax, type TaxContext } from "@/lib/tax";

const intra: TaxContext = {
  regime: "INDIA_GST",
  currency: "INR",
  fiscalYear: "2026-27",
  isReverseCharge: false,
  issuer: { countryCode: "IN", gstStateCode: "29", gstin: "29ABCDE1234F1Z5" },
  client: { countryCode: "IN", gstStateCode: "29" },
};

function item(position: number, quantity: string, unitPrice: string, taxRate = "18") {
  return { position, quantity: D(quantity), unitPrice: D(unitPrice), taxRate: D(taxRate) };
}

/** Builds the invoice exactly the way the builder preview and the issue transaction do. */
function totalsFor(input: TotalsInput, ctx: TaxContext = intra) {
  const tax = computeTax(ctx, computeLines(input));
  return computeTotals(input, tax);
}

const fixed = (t: ReturnType<typeof computeTotals>) => ({
  subtotal: t.subtotal.toFixed(2),
  discountAmount: t.discountAmount.toFixed(2),
  taxableAmount: t.taxableAmount.toFixed(2),
  taxAmount: t.taxAmount.toFixed(2),
  roundingAdjustment: t.roundingAdjustment.toFixed(2),
  total: t.total.toFixed(2),
  tdsExpected: t.tdsExpected.toFixed(2),
  netExpected: t.netExpected.toFixed(2),
  items: t.items.map((i) => [
    i.position,
    i.lineSubtotal.toFixed(2),
    i.taxAmount.toFixed(2),
    i.lineTotal.toFixed(2),
  ]),
});

describe("computeLines", () => {
  it("rounds quantity × unit price to minor units per line", () => {
    const lines = computeLines({
      currency: "INR",
      items: [item(1, "1.5", "333.333"), item(2, "3", "0.335")],
    });
    expect(
      lines.map((l) => [l.position, l.lineSubtotal.toFixed(2), l.taxableAmount.toFixed(2)]),
    ).toEqual([
      [1, "500.00", "500.00"],
      [2, "1.01", "1.01"],
    ]);
    expect(lines[0]?.taxRate.toString()).toBe("18");
  });

  it("apportions a percentage discount pro-rata by line subtotal", () => {
    const lines = computeLines({
      currency: "INR",
      items: [item(1, "1", "10000"), item(2, "1", "5000")],
      discount: { type: "PERCENT", value: D("10") },
    });
    expect(lines.map((l) => l.taxableAmount.toFixed(2))).toEqual(["9000.00", "4500.00"]);
  });

  it("apportions a fixed discount with largest remainder so the parts foot", () => {
    const lines = computeLines({
      currency: "INR",
      items: [item(1, "1", "10000"), item(2, "1", "5000")],
      discount: { type: "AMOUNT", value: D("250") },
    });
    expect(lines.map((l) => l.taxableAmount.toFixed(2))).toEqual(["9833.33", "4916.67"]);
  });

  it("rounds the percentage discount at the subtotal, not per line", () => {
    // 3 lines of 0.01 at 33.333 % → subtotal 0.03 × 0.33333 = 0.009999 → 0.01 total discount
    const lines = computeLines({
      currency: "INR",
      items: [item(1, "1", "0.01"), item(2, "1", "0.01"), item(3, "1", "0.01")],
      discount: { type: "PERCENT", value: D("33.333") },
    });
    expect(lines.map((l) => l.taxableAmount.toFixed(2))).toEqual(["0.00", "0.01", "0.01"]);
  });

  it("returns no lines for no items", () => {
    expect(computeLines({ currency: "INR", items: [] })).toEqual([]);
  });
});

describe("computeTotals", () => {
  it("10 % discount on [10000, 5000] @ 18 % → taxable 13500, GST 2430, total 15930, TDS 1350, net 14580", () => {
    const t = totalsFor({
      currency: "INR",
      items: [item(1, "1", "10000"), item(2, "1", "5000")],
      discount: { type: "PERCENT", value: D("10") },
      tdsRate: D("10"),
    });
    expect(fixed(t)).toEqual({
      subtotal: "15000.00",
      discountAmount: "1500.00",
      taxableAmount: "13500.00",
      taxAmount: "2430.00",
      roundingAdjustment: "0.00",
      total: "15930.00",
      tdsExpected: "1350.00",
      netExpected: "14580.00",
      items: [
        [1, "10000.00", "1620.00", "11620.00"],
        [2, "5000.00", "810.00", "5810.00"],
      ],
    });
  });

  it("fixed discount 250 → taxable 14750, GST 2655, total 17405", () => {
    const t = totalsFor({
      currency: "INR",
      items: [item(1, "1", "10000"), item(2, "1", "5000")],
      discount: { type: "AMOUNT", value: D("250") },
    });
    expect(fixed(t)).toMatchObject({
      subtotal: "15000.00",
      discountAmount: "250.00",
      taxableAmount: "14750.00",
      taxAmount: "2655.00",
      total: "17405.00",
      tdsExpected: "0.00",
      netExpected: "17405.00",
    });
    // per-line tax on the discounted taxable parts: 9833.33 × 9 % = 885.00 ×2, 4916.67 × 9 % = 442.50 ×2
    expect(fixed(t).items).toEqual([
      [1, "10000.00", "1770.00", "11770.00"],
      [2, "5000.00", "885.00", "5885.00"],
    ]);
  });

  it("roundingAdjustment 0.40 makes the total a whole rupee", () => {
    // 13499.66 × 9 % = 1214.9694 → 1214.97 ×2 → tax 2429.94 → total 15929.60
    const input: TotalsInput = { currency: "INR", items: [item(1, "1", "13499.66")] };
    expect(totalsFor(input).total.toFixed(2)).toBe("15929.60");
    const t = totalsFor({ ...input, roundingAdjustment: D("0.40") });
    expect(t.roundingAdjustment.toFixed(2)).toBe("0.40");
    expect(t.total.toFixed(2)).toBe("15930.00");
    expect(t.netExpected.toFixed(2)).toBe("15930.00");
  });

  it("negative roundingAdjustment reduces the total", () => {
    const t = totalsFor({
      currency: "INR",
      items: [item(1, "1", "13499.66")],
      roundingAdjustment: D("-0.60"),
    });
    expect(t.total.toFixed(2)).toBe("15929.00");
  });

  it("TDS is computed on the taxable amount and net deducts it from the total", () => {
    const t = totalsFor({
      currency: "INR",
      items: [item(1, "1", "333.33")],
      tdsRate: D("10"),
    });
    expect(t.taxableAmount.toFixed(2)).toBe("333.33");
    expect(t.tdsExpected.toFixed(2)).toBe("33.33");
    expect(t.total.toFixed(2)).toBe("393.33");
    expect(t.netExpected.toFixed(2)).toBe("360.00");
  });

  it("null discount, rounding and TDS behave like absent", () => {
    const t = totalsFor({
      currency: "INR",
      items: [item(1, "2", "100")],
      discount: null,
      roundingAdjustment: null,
      tdsRate: null,
    });
    expect(fixed(t)).toMatchObject({
      subtotal: "200.00",
      discountAmount: "0.00",
      taxableAmount: "200.00",
      taxAmount: "36.00",
      total: "236.00",
      tdsExpected: "0.00",
      netExpected: "236.00",
    });
  });

  it("works for zero-decimal currencies and a no-tax regime", () => {
    const none: TaxContext = { ...intra, regime: "NONE", currency: "JPY" };
    const t = totalsFor({ currency: "JPY", items: [item(1, "3", "333.4", "0")] }, none);
    expect(t.subtotal.toString()).toBe("1000");
    expect(t.taxAmount.toString()).toBe("0");
    expect(t.total.toString()).toBe("1000");
    expect(t.items[0]?.lineTotal.toString()).toBe("1000");
  });

  it("yields zeros for an empty invoice", () => {
    const t = totalsFor({ currency: "INR", items: [] });
    expect(t.subtotal.isZero()).toBe(true);
    expect(t.total.isZero()).toBe(true);
    expect(t.items).toEqual([]);
  });

  it("rejects a rounding adjustment of a whole unit or more", () => {
    const input: TotalsInput = { currency: "INR", items: [item(1, "1", "100")] };
    expect(() => totalsFor({ ...input, roundingAdjustment: D("1") })).toThrow(
      /rounding adjustment/i,
    );
    expect(() => totalsFor({ ...input, roundingAdjustment: D("-1.25") })).toThrow(
      /rounding adjustment/i,
    );
    expect(() => totalsFor({ ...input, roundingAdjustment: D("0.99") })).not.toThrow();
  });

  it("rejects a discount that exceeds the subtotal or is negative", () => {
    const items = [item(1, "1", "100")];
    expect(() =>
      computeLines({ currency: "INR", items, discount: { type: "AMOUNT", value: D("100.01") } }),
    ).toThrow(/discount/i);
    expect(() =>
      computeLines({ currency: "INR", items, discount: { type: "PERCENT", value: D("101") } }),
    ).toThrow(/discount/i);
    expect(() =>
      computeLines({ currency: "INR", items, discount: { type: "AMOUNT", value: D("-1") } }),
    ).toThrow(/discount/i);
    expect(() =>
      computeLines({ currency: "INR", items, discount: { type: "AMOUNT", value: D("100") } }),
    ).not.toThrow();
  });
});

describe("suggestRoundingAdjustment", () => {
  it("rounds to the nearest whole unit", () => {
    expect(suggestRoundingAdjustment(D("15929.60"), "INR").toFixed(2)).toBe("0.40");
    expect(suggestRoundingAdjustment(D("15930.40"), "INR").toFixed(2)).toBe("-0.40");
    expect(suggestRoundingAdjustment(D("15930.50"), "INR").toFixed(2)).toBe("0.50");
    expect(suggestRoundingAdjustment(D("15930"), "INR").isZero()).toBe(true);
  });
  it("is zero for zero-decimal currencies", () => {
    expect(suggestRoundingAdjustment(D("15929.60"), "JPY").isZero()).toBe(true);
    expect(suggestRoundingAdjustment(D("999"), "JPY").isZero()).toBe(true);
  });
});

describe("isValidRoundingAdjustment", () => {
  it("accepts |adj| < 1 only", () => {
    expect(isValidRoundingAdjustment(D("0.99"))).toBe(true);
    expect(isValidRoundingAdjustment(D("-0.99"))).toBe(true);
    expect(isValidRoundingAdjustment(D("0"))).toBe(true);
    expect(isValidRoundingAdjustment(D("1"))).toBe(false);
    expect(isValidRoundingAdjustment(D("-1"))).toBe(false);
  });
});
