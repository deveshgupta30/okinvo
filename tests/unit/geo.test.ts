import { describe, expect, it } from "vitest";
import { COUNTRIES, countryName, findCountry } from "@/lib/geo/countries";
import { CURRENCIES, currencyName, pinnedFirst } from "@/lib/geo/currencies";
import { currencyForCountry, guessCountry } from "@/lib/geo/detect";
import { countryForTimeZone } from "@/lib/geo/timezone-country";

describe("countries", () => {
  it("lists every ISO 3166-1 alpha-2 country with a currency", () => {
    expect(COUNTRIES.length).toBeGreaterThanOrEqual(240);
    expect(new Set(COUNTRIES.map((c) => c.code)).size).toBe(COUNTRIES.length);
    for (const c of COUNTRIES) {
      expect(c.code).toMatch(/^[A-Z]{2}$/);
      expect(c.currency).toMatch(/^[A-Z]{3}$/);
    }
    expect(findCountry("IN")).toMatchObject({ code: "IN", currency: "INR" });
    expect(findCountry("gb")).toMatchObject({ code: "GB", currency: "GBP" });
    expect(findCountry("US")).toMatchObject({ code: "US", currency: "USD" });
    expect(findCountry("ZZ")).toBeNull();
  });
  it("names countries through Intl", () => {
    expect(countryName("IN")).toBe("India");
    expect(countryName("GB")).toBe("United Kingdom");
  });
});

describe("currencies", () => {
  it("lists the ISO 4217 codes Node knows, with names and minor units", () => {
    expect(CURRENCIES.length).toBeGreaterThanOrEqual(150);
    const inr = CURRENCIES.find((c) => c.code === "INR");
    expect(inr).toMatchObject({ code: "INR", minorUnits: 2 });
    expect(currencyName("USD")).toMatch(/dollar/i);
    expect(CURRENCIES.find((c) => c.code === "JPY")?.minorUnits).toBe(0);
  });
  it("pins the three defaults on top and keeps the rest alphabetical", () => {
    const codes = pinnedFirst(CURRENCIES, ["INR", "GBP", "USD"]).map((c) => c.code);
    expect(codes.slice(0, 3)).toEqual(["INR", "GBP", "USD"]);
    const rest = codes.slice(3);
    expect([...rest].sort()).toEqual(rest);
    expect(rest).not.toContain("INR");
  });
});

describe("timezone → country", () => {
  it("maps the common zones", () => {
    expect(countryForTimeZone("Asia/Kolkata")).toBe("IN");
    expect(countryForTimeZone("Asia/Calcutta")).toBe("IN");
    expect(countryForTimeZone("Europe/London")).toBe("GB");
    expect(countryForTimeZone("America/New_York")).toBe("US");
    expect(countryForTimeZone("America/Los_Angeles")).toBe("US");
    expect(countryForTimeZone("Europe/Berlin")).toBe("DE");
    expect(countryForTimeZone("Australia/Sydney")).toBe("AU");
    expect(countryForTimeZone("Asia/Singapore")).toBe("SG");
    expect(countryForTimeZone("Asia/Dubai")).toBe("AE");
  });
  it("returns null for UTC, Etc zones and unknown names", () => {
    expect(countryForTimeZone("UTC")).toBeNull();
    expect(countryForTimeZone("Etc/GMT+5")).toBeNull();
    expect(countryForTimeZone("Mars/Olympus")).toBeNull();
  });
  it("covers most zones this Node build reports", () => {
    const zones = Intl.supportedValuesOf("timeZone").filter((z) => !/^(Etc|UTC)/.test(z));
    const mapped = zones.filter((z) => countryForTimeZone(z) !== null);
    expect(mapped.length / zones.length).toBeGreaterThan(0.95);
  });
});

describe("guessCountry / currencyForCountry", () => {
  it("prefers the timezone, then the language region, then India", () => {
    expect(guessCountry({ timeZone: "Asia/Kolkata", language: "en-US" })).toBe("IN");
    expect(guessCountry({ timeZone: "Europe/London", language: "en-US" })).toBe("GB");
    expect(guessCountry({ timeZone: "Etc/UTC", language: "en-GB" })).toBe("GB");
    expect(guessCountry({ timeZone: "Etc/UTC", language: "pt-BR" })).toBe("BR");
    expect(guessCountry({ timeZone: "Etc/UTC", language: "xx" })).toBe("IN");
    expect(guessCountry({ timeZone: undefined, language: undefined })).toBe("IN");
  });
  it("suggests the country's currency, falling back to INR", () => {
    expect(currencyForCountry("US")).toBe("USD");
    expect(currencyForCountry("GB")).toBe("GBP");
    expect(currencyForCountry("DE")).toBe("EUR");
    expect(currencyForCountry("ZZ")).toBe("INR");
  });
});
