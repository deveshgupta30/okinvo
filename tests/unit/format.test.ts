import { describe, expect, it } from "vitest";
import {
  formatAmount,
  formatDate,
  formatDateTime,
  formatMoney,
  formatPercent,
  formatQuantity,
} from "@/lib/format";
import { D } from "@/lib/money";

const NBSP = /[  ]/;

describe("formatMoney", () => {
  it("groups en-IN amounts in lakh/crore style with the rupee symbol", () => {
    expect(formatMoney("1234567", "INR", "en-IN")).toBe("₹12,34,567.00");
  });
  it("groups en-US amounts in thousands with the dollar symbol", () => {
    expect(formatMoney(D("1234567"), "USD", "en-US")).toBe("$1,234,567.00");
  });
  it("prints zero-decimal currencies without a fraction", () => {
    expect(formatMoney("1500", "JPY", "en-US")).toBe("¥1,500");
    expect(formatMoney("1500.4", "JPY", "en-US")).toBe("¥1,500");
  });
  it("prints the ISO code with a plain space when display is 'code'", () => {
    expect(formatMoney("1234", "INR", "en-IN", "code")).toBe("INR 1,234.00");
    expect(formatMoney("1234", "INR", "en-US", "code")).toBe("INR 1,234.00");
    expect(formatMoney("1234", "USD", "en-US", "code")).toBe("USD 1,234.00");
  });
  it("rounds half-up to the currency's minor units before formatting", () => {
    expect(formatMoney("1.005", "INR", "en-IN")).toBe("₹1.01");
    expect(formatMoney("0.004", "USD", "en-US")).toBe("$0.00");
  });
  it("never emits non-breaking spaces", () => {
    expect(formatMoney("1234", "INR", "en-IN", "code")).not.toMatch(NBSP);
    expect(formatMoney("1234", "EUR", "de-DE")).not.toMatch(NBSP);
  });
  it("keeps the full precision of large Decimal amounts", () => {
    expect(formatMoney("123456789012.34", "INR", "en-IN")).toBe("₹1,23,45,67,89,012.34");
  });
});

describe("formatAmount", () => {
  it("formats the number only, grouped per locale, with fixed minor units", () => {
    expect(formatAmount("1234567.5", "INR", "en-IN")).toBe("12,34,567.50");
    expect(formatAmount("1234567.5", "USD", "en-US")).toBe("1,234,567.50");
    expect(formatAmount("1500", "JPY", "en-US")).toBe("1,500");
    expect(formatAmount("0", "INR", "en-IN")).toBe("0.00");
  });
  it("rounds half-up to minor units", () => {
    expect(formatAmount("2.675", "USD", "en-US")).toBe("2.68");
  });
});

describe("formatQuantity", () => {
  it("prints up to three decimals and trims trailing zeros", () => {
    expect(formatQuantity("2.500", "en-US")).toBe("2.5");
    expect(formatQuantity("10", "en-US")).toBe("10");
    expect(formatQuantity("10.000", "en-US")).toBe("10");
    expect(formatQuantity("0.125", "en-US")).toBe("0.125");
  });
  it("rounds half-up at the fourth decimal", () => {
    expect(formatQuantity("1.2345", "en-US")).toBe("1.235");
  });
  it("groups per locale", () => {
    expect(formatQuantity("1234.5", "en-IN")).toBe("1,234.5");
    expect(formatQuantity("1234567.5", "en-IN")).toBe("12,34,567.5");
  });
});

describe("formatPercent", () => {
  it("prints the rate without trailing zeros and with a percent sign", () => {
    expect(formatPercent("18")).toBe("18%");
    expect(formatPercent("18.00")).toBe("18%");
    expect(formatPercent("2.5")).toBe("2.5%");
    expect(formatPercent(D("2.50"))).toBe("2.5%");
    expect(formatPercent(0)).toBe("0%");
    expect(formatPercent("0.125")).toBe("0.125%");
  });
});

describe("formatDate", () => {
  it("renders a calendar date in the locale's medium style", () => {
    expect(formatDate("2026-04-01", "en-IN")).toBe("1 Apr 2026");
    expect(formatDate("2026-04-01", "en-US")).toBe("Apr 1, 2026");
    expect(formatDate("2026-04-01", "en-GB")).toBe("1 Apr 2026");
  });
  it("is independent of the server timezone (always the given calendar day)", () => {
    expect(formatDate("2026-12-31", "en-US")).toBe("Dec 31, 2026");
    expect(formatDate("2026-01-01", "en-US")).toBe("Jan 1, 2026");
  });
  it("rejects a malformed date string", () => {
    expect(() => formatDate("2026-13-01", "en-IN")).toThrow(RangeError);
    expect(() => formatDate("01/04/2026", "en-IN")).toThrow(RangeError);
  });
});

describe("formatDateTime", () => {
  const instant = new Date("2026-04-01T10:30:00Z");
  it("renders an instant in the given timezone and locale", () => {
    expect(formatDateTime(instant, "en-IN", "Asia/Kolkata")).toBe("1 Apr 2026, 4:00 pm");
    expect(formatDateTime(instant, "en-US", "America/New_York")).toBe("Apr 1, 2026, 6:30 AM");
    expect(formatDateTime(instant, "en-GB", "Europe/London")).toBe("1 Apr 2026, 11:30");
  });
  it("never emits non-breaking spaces", () => {
    expect(formatDateTime(instant, "en-US", "America/New_York")).not.toMatch(NBSP);
  });
});
