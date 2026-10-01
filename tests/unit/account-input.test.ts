import { describe, expect, it } from "vitest";
import { AccountInputSchema } from "@/lib/schemas/account-input";
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
});

describe("TIMEZONES", () => {
  it("lists IANA zones including the common ones, sorted", () => {
    expect(TIMEZONES).toContain("Asia/Kolkata");
    expect(TIMEZONES).toContain("Europe/London");
    expect(TIMEZONES).toContain("UTC");
    expect([...TIMEZONES].sort()).toEqual(TIMEZONES);
  });
});
