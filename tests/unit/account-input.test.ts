import { describe, expect, it } from "vitest";
import { AccountInputSchema, USAGES } from "@/lib/schemas/account-input";
import { TIMEZONES } from "@/lib/timezones";

describe("AccountInputSchema", () => {
  it("accepts a name, an IANA timezone and a theme mode", () => {
    expect(
      AccountInputSchema.parse({ name: " Me ", timezone: "Asia/Kolkata", theme: "dark" }),
    ).toEqual({ name: "Me", timezone: "Asia/Kolkata", theme: "dark" });
  });
  it("rejects unknown zones, blank names and unknown themes", () => {
    expect(
      AccountInputSchema.safeParse({ name: "Me", timezone: "Mars/Olympus", theme: "dark" }).success,
    ).toBe(false);
    expect(
      AccountInputSchema.safeParse({ name: "  ", timezone: "UTC", theme: "dark" }).success,
    ).toBe(false);
    expect(
      AccountInputSchema.safeParse({ name: "Me", timezone: "UTC", theme: "blue" }).success,
    ).toBe(false);
  });

  const base = { name: "Asha", timezone: "Asia/Kolkata", theme: "system" as const };

  it("accepts the region and language preferences, normalising the country code", () => {
    const parsed = AccountInputSchema.parse({
      ...base,
      locale: "en-GB",
      countryCode: "gb",
      currency: "GBP",
    });
    expect(parsed).toMatchObject({ locale: "en-GB", countryCode: "GB", currency: "GBP" });
  });

  it("leaves the preferences undefined when the form does not send them", () => {
    const parsed = AccountInputSchema.parse(base);
    expect(parsed.locale).toBeUndefined();
    expect(parsed.countryCode).toBeUndefined();
    expect(parsed.currency).toBeUndefined();
  });

  it("rejects a malformed country or an unsupported currency", () => {
    expect(() => AccountInputSchema.parse({ ...base, countryCode: "GBR" })).toThrow();
    expect(() => AccountInputSchema.parse({ ...base, currency: "US" })).toThrow();
  });

  it("names the two usage intents", () => {
    expect(USAGES).toEqual(["PERSONAL", "BUSINESS"]);
  });
});

describe("TIMEZONES", () => {
  it("lists IANA zones including the common ones, sorted", () => {
    expect(TIMEZONES).toContain("Asia/Kolkata");
    expect(TIMEZONES).toContain("Europe/London");
    expect(TIMEZONES).toContain("UTC");
    expect([...TIMEZONES].sort()).toEqual(TIMEZONES);
  });
});
