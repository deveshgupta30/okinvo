import { describe, expect, it } from "vitest";
import { D, ZERO, apportion, minorUnits, roundMoney, sum, toMoneyString } from "@/lib/money";

describe("minorUnits", () => {
  it("derives 2 for INR/USD/GBP/EUR and 0 for JPY/KRW from Intl", () => {
    expect(minorUnits("INR")).toBe(2);
    expect(minorUnits("USD")).toBe(2);
    expect(minorUnits("GBP")).toBe(2);
    expect(minorUnits("EUR")).toBe(2);
    expect(minorUnits("JPY")).toBe(0);
    expect(minorUnits("KRW")).toBe(0);
  });
  it("throws for an unknown currency code", () => {
    expect(() => minorUnits("XYZ")).toThrow();
  });
});

describe("roundMoney", () => {
  it("rounds half-up to the currency's minor units", () => {
    expect(roundMoney("1.005", "INR").toString()).toBe("1.01");
    expect(roundMoney("0.0075", "USD").toString()).toBe("0.01");
    expect(roundMoney("0.0025", "USD").toString()).toBe("0");
    expect(roundMoney("2.5", "JPY").toString()).toBe("3");
    expect(roundMoney(D("82.4175"), "JPY").toString()).toBe("82");
  });
  it("rounds negative halves away from zero (ROUND_HALF_UP)", () => {
    expect(roundMoney("-1.005", "INR").toString()).toBe("-1.01");
  });
});

describe("sum", () => {
  it("adds Decimal values without floating-point drift", () => {
    expect(sum(["0.1", "0.2", D("0.3")]).toString()).toBe("0.6");
    expect(sum([]).equals(ZERO)).toBe(true);
  });
});

describe("apportion", () => {
  it("splits with largest remainder so the parts sum exactly", () => {
    const parts = apportion("100", ["1", "1", "1"], "INR").map(String);
    expect(parts).toEqual(["33.34", "33.33", "33.33"]);
  });
  it("splits equally when every weight is zero", () => {
    expect(apportion("10", ["0", "0"], "INR").map(String)).toEqual(["5", "5"]);
  });
  it("respects zero-decimal currencies", () => {
    expect(apportion("1", ["3", "1"], "JPY").map(String)).toEqual(["1", "0"]);
  });
  it("returns an empty array for no weights", () => {
    expect(apportion("10", [], "INR")).toEqual([]);
  });
  it("apportions a discount pro-rata to line subtotals", () => {
    expect(apportion("1500", ["10000", "5000"], "INR").map(String)).toEqual(["1000", "500"]);
  });
});

describe("toMoneyString", () => {
  it("prints fixed minor units with no grouping", () => {
    expect(toMoneyString("1234.5", "INR")).toBe("1234.50");
    expect(toMoneyString("1500", "JPY")).toBe("1500");
    expect(toMoneyString(D("-0.1"), "USD")).toBe("-0.10");
  });
});
