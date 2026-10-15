import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { convert, RateTableSchema, RatesError, type RateTable } from "@/lib/rates";

const table: RateTable = {
  asOf: "2026-10-15",
  base: "USD",
  rates: { USD: "1", INR: "88.5", EUR: "0.92", JPY: "151.3", GBP: "0.78" },
};

/** Addendum §5: a bundled USD-based table, Decimal conversion through the base, minor units. */
describe("convert", () => {
  it("converts through the base currency with Decimal math, rounded to the target's minor units", () => {
    // 100 INR → USD = 100 / 88.5 = 1.1299... → 1.13; → EUR = 1.1299 * 0.92 = 1.0395... → 1.04
    expect(convert("100", "INR", "USD", table).toString()).toBe("1.13");
    expect(convert("100", "INR", "EUR", table).toString()).toBe("1.04");
    // JPY has no minor units
    expect(convert("10", "USD", "JPY", table).toString()).toBe("1513");
    expect(convert("1000", "JPY", "USD", table).toString()).toBe("6.61");
  });

  it("returns the amount unchanged for the same currency", () => {
    expect(convert("12.345", "INR", "INR", table).toString()).toBe("12.345");
  });

  it("refuses a currency the table does not know", () => {
    expect(() => convert("1", "XXX", "USD", table)).toThrow(RatesError);
    expect(() => convert("1", "USD", "ZZZ", table)).toThrow(/ZZZ/);
  });

  it("refuses a zero or negative rate rather than dividing by it", () => {
    const broken: RateTable = { ...table, rates: { ...table.rates, BAD: "0" } };
    expect(() => convert("1", "BAD", "USD", broken)).toThrow(RatesError);
  });
});

describe("bundled snapshot", () => {
  it("ships data/exchange-rates.json in the table shape, USD based, with a date and INR", () => {
    const raw = JSON.parse(
      readFileSync(path.join(process.cwd(), "data", "exchange-rates.json"), "utf8"),
    ) as unknown;
    const parsed = RateTableSchema.parse(raw);
    expect(parsed.base).toBe("USD");
    expect(parsed.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Number(parsed.rates.INR)).toBeGreaterThan(1);
    expect(Object.keys(parsed.rates).length).toBeGreaterThan(50);
    expect(parsed.rates.USD).toBe("1");
  });

  it("rejects a table with a non-numeric rate", () => {
    expect(() =>
      RateTableSchema.parse({ asOf: "2026-10-15", base: "USD", rates: { INR: "eighty" } }),
    ).toThrow();
  });
});
