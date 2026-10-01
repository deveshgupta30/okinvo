import { describe, expect, it } from "vitest";
import {
  DateStringSchema,
  addDays,
  compareDates,
  fromDateString,
  isValidTimeZone,
  toDateString,
  todayIn,
} from "@/lib/dates";

describe("DateStringSchema", () => {
  it("accepts real calendar dates only", () => {
    expect(DateStringSchema.parse("2026-04-01")).toBe("2026-04-01");
    expect(DateStringSchema.parse("2028-02-29")).toBe("2028-02-29");
    expect(DateStringSchema.safeParse("2026-02-30").success).toBe(false);
    expect(DateStringSchema.safeParse("2026-13-01").success).toBe(false);
    expect(DateStringSchema.safeParse("01/04/2026").success).toBe(false);
    expect(DateStringSchema.safeParse("2026-4-1").success).toBe(false);
  });
});

describe("toDateString / fromDateString", () => {
  it("uses UTC calendar parts", () => {
    expect(toDateString(new Date("2026-03-31T23:30:00Z"))).toBe("2026-03-31");
    expect(fromDateString("2026-04-01").toISOString()).toBe("2026-04-01T00:00:00.000Z");
  });
});

describe("todayIn", () => {
  const instant = new Date("2026-03-31T20:00:00Z");
  it("computes the calendar date in the user's zone", () => {
    expect(todayIn("Asia/Kolkata", instant)).toBe("2026-04-01");
    expect(todayIn("America/Los_Angeles", instant)).toBe("2026-03-31");
    expect(todayIn("UTC", instant)).toBe("2026-03-31");
  });
  it("falls back to UTC for an invalid zone", () => {
    expect(todayIn("Mars/Olympus", instant)).toBe("2026-03-31");
  });
});

describe("addDays / compareDates", () => {
  it("crosses month and leap boundaries", () => {
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-04-30", -30)).toBe("2026-03-31");
  });
  it("compares lexically consistent dates", () => {
    expect(compareDates("2026-04-01", "2026-04-02")).toBe(-1);
    expect(compareDates("2026-04-02", "2026-04-02")).toBe(0);
    expect(compareDates("2027-01-01", "2026-12-31")).toBe(1);
  });
});

describe("isValidTimeZone", () => {
  it("recognises IANA zones", () => {
    expect(isValidTimeZone("Asia/Kolkata")).toBe(true);
    expect(isValidTimeZone("Europe/London")).toBe(true);
    expect(isValidTimeZone("Nowhere/Nope")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
  });
});
