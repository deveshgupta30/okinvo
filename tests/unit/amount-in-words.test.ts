import { describe, expect, it } from "vitest";
import { CURRENCY_WORDS, amountInWords } from "@/lib/format";
import { D } from "@/lib/money";

describe("amountInWords — Indian numbering (en-IN)", () => {
  it("uses lakh and crore", () => {
    expect(amountInWords("1234567.00", "INR", "en-IN")).toBe(
      "Rupees Twelve Lakh Thirty-Four Thousand Five Hundred Sixty-Seven Only",
    );
    expect(amountInWords("12345678", "INR", "en-IN")).toBe(
      "Rupees One Crore Twenty-Three Lakh Forty-Five Thousand Six Hundred Seventy-Eight Only",
    );
  });
  it("prints the minor part after 'and'", () => {
    expect(amountInWords("1050.50", "INR", "en-IN")).toBe(
      "Rupees One Thousand Fifty and Fifty Paise Only",
    );
    expect(amountInWords(D("1234567.50"), "INR", "en-IN")).toBe(
      "Rupees Twelve Lakh Thirty-Four Thousand Five Hundred Sixty-Seven and Fifty Paise Only",
    );
  });
  it("prints zero and round hundreds", () => {
    expect(amountInWords("0", "INR", "en-IN")).toBe("Rupees Zero Only");
    expect(amountInWords("0.00", "INR", "en-IN")).toBe("Rupees Zero Only");
    expect(amountInWords("100", "INR", "en-IN")).toBe("Rupees One Hundred Only");
    expect(amountInWords("1000", "INR", "en-IN")).toBe("Rupees One Thousand Only");
    expect(amountInWords("100000", "INR", "en-IN")).toBe("Rupees One Lakh Only");
    expect(amountInWords("10000000", "INR", "en-IN")).toBe("Rupees One Crore Only");
  });
  it("prints a minor-only amount as Zero and the minor part", () => {
    expect(amountInWords("0.50", "INR", "en-IN")).toBe("Rupees Zero and Fifty Paise Only");
  });
  it("continues past a hundred crore in crore units", () => {
    expect(amountInWords("1000000000", "INR", "en-IN")).toBe("Rupees One Hundred Crore Only");
    expect(amountInWords("1000000000000", "INR", "en-IN")).toBe("Rupees One Lakh Crore Only");
  });
  it("handles teens and hyphenated tens inside every group", () => {
    expect(amountInWords("1119", "INR", "en-IN")).toBe(
      "Rupees One Thousand One Hundred Nineteen Only",
    );
    expect(amountInWords("2199999", "INR", "en-IN")).toBe(
      "Rupees Twenty-One Lakh Ninety-Nine Thousand Nine Hundred Ninety-Nine Only",
    );
    expect(amountInWords("0.99", "INR", "en-IN")).toBe("Rupees Zero and Ninety-Nine Paise Only");
  });
  it("applies Indian numbering to any Indian-region locale", () => {
    expect(amountInWords("100000", "INR", "hi-IN")).toBe("Rupees One Lakh Only");
  });
  it("rounds half-up to minor units first", () => {
    expect(amountInWords("10.005", "INR", "en-IN")).toBe("Rupees Ten and One Paise Only");
    expect(amountInWords("99.999", "INR", "en-IN")).toBe("Rupees One Hundred Only");
  });
});

describe("amountInWords — short scale (other locales)", () => {
  it("uses million/billion", () => {
    expect(amountInWords("1234567.89", "USD", "en-US")).toBe(
      "US Dollars One Million Two Hundred Thirty-Four Thousand Five Hundred Sixty-Seven and Eighty-Nine Cents Only",
    );
    expect(amountInWords("1000000000", "USD", "en-US")).toBe("US Dollars One Billion Only");
    expect(amountInWords("1000000000000", "USD", "en-US")).toBe("US Dollars One Trillion Only");
  });
  it("follows the locale, not the currency", () => {
    expect(amountInWords("1234567", "INR", "en-US")).toBe(
      "Rupees One Million Two Hundred Thirty-Four Thousand Five Hundred Sixty-Seven Only",
    );
    expect(amountInWords("1234567", "USD", "en-IN")).toBe(
      "US Dollars Twelve Lakh Thirty-Four Thousand Five Hundred Sixty-Seven Only",
    );
  });
  it("names the other known currencies", () => {
    expect(amountInWords("20.01", "GBP", "en-GB")).toBe("Pounds Twenty and One Pence Only");
    expect(amountInWords("5.25", "EUR", "de-DE")).toBe("Euros Five and Twenty-Five Cents Only");
    expect(amountInWords("7.10", "AED", "en-AE")).toBe("Dirhams Seven and Ten Fils Only");
    expect(amountInWords("7.10", "CHF", "de-CH")).toBe("Swiss Francs Seven and Ten Rappen Only");
    expect(amountInWords("3", "AUD", "en-AU")).toBe("Australian Dollars Three Only");
    expect(amountInWords("3", "CAD", "en-CA")).toBe("Canadian Dollars Three Only");
    expect(amountInWords("3", "SGD", "en-SG")).toBe("Singapore Dollars Three Only");
  });
  it("prints zero and minor-only amounts", () => {
    expect(amountInWords("0", "USD", "en-US")).toBe("US Dollars Zero Only");
    expect(amountInWords("0.05", "USD", "en-US")).toBe("US Dollars Zero and Five Cents Only");
  });
});

describe("amountInWords — zero-decimal currencies", () => {
  it("never prints a minor part", () => {
    expect(amountInWords("1500", "JPY", "en-US")).toBe("Yen One Thousand Five Hundred Only");
    expect(amountInWords("1500", "JPY", "ja-JP")).toBe("Yen One Thousand Five Hundred Only");
    expect(amountInWords("1500.4", "JPY", "en-US")).toBe("Yen One Thousand Five Hundred Only");
    expect(amountInWords("1500.5", "JPY", "en-US")).toBe("Yen One Thousand Five Hundred One Only");
  });
});

describe("amountInWords — fallbacks and edge cases", () => {
  it("falls back to the Intl display name and 'Cents' for currencies without a words entry", () => {
    expect(CURRENCY_WORDS["NZD"]).toBeUndefined();
    expect(amountInWords("10.50", "NZD", "en-NZ")).toBe(
      "New Zealand Dollar Ten and Fifty Cents Only",
    );
  });
  it("prefixes negative amounts with Minus", () => {
    expect(amountInWords("-5", "INR", "en-IN")).toBe("Minus Rupees Five Only");
  });
  it("accepts a lower-case currency code", () => {
    expect(amountInWords("1", "inr", "en-IN")).toBe("Rupees One Only");
  });
  it("throws for an unknown currency", () => {
    expect(() => amountInWords("1", "XYZ", "en-IN")).toThrow(RangeError);
  });
});

describe("CURRENCY_WORDS", () => {
  it("covers the common currencies with their major and minor names", () => {
    expect(CURRENCY_WORDS["INR"]).toEqual({ major: "Rupees", minor: "Paise" });
    expect(CURRENCY_WORDS["USD"]).toEqual({ major: "US Dollars", minor: "Cents" });
    expect(CURRENCY_WORDS["GBP"]).toEqual({ major: "Pounds", minor: "Pence" });
    expect(CURRENCY_WORDS["EUR"]).toEqual({ major: "Euros", minor: "Cents" });
    expect(CURRENCY_WORDS["JPY"]).toEqual({ major: "Yen", minor: "" });
    expect(CURRENCY_WORDS["AED"]).toEqual({ major: "Dirhams", minor: "Fils" });
    expect(CURRENCY_WORDS["CHF"]).toEqual({ major: "Swiss Francs", minor: "Rappen" });
    for (const code of ["AUD", "CAD", "SGD"]) {
      expect(CURRENCY_WORDS[code]?.major).toMatch(/Dollars$/);
      expect(CURRENCY_WORDS[code]?.minor).toBe("Cents");
    }
  });
});
