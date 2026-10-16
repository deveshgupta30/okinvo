import { describe, expect, it } from "vitest";
import {
  NumberFormatSchema,
  fiscalYearOf,
  fiscalYearRange,
  fiscalYearShort,
  fiscalYearsBetween,
  formatDocumentNumber,
  safeFileStem,
} from "@/lib/numbering";

describe("fiscalYearOf", () => {
  it("labels an April-start year across the 31 Mar / 1 Apr boundary", () => {
    expect(fiscalYearOf("2026-04-01", 4)).toBe("2026-27");
    expect(fiscalYearOf("2027-03-31", 4)).toBe("2026-27");
    expect(fiscalYearOf("2026-03-31", 4)).toBe("2025-26");
    expect(fiscalYearOf("2026-10-01", 4)).toBe("2026-27");
  });
  it("labels a January-start year with the calendar year alone", () => {
    expect(fiscalYearOf("2026-01-01", 1)).toBe("2026");
    expect(fiscalYearOf("2026-12-31", 1)).toBe("2026");
  });
  it("handles other start months and the century wrap", () => {
    expect(fiscalYearOf("2026-06-30", 7)).toBe("2025-26");
    expect(fiscalYearOf("2026-07-01", 7)).toBe("2026-27");
    expect(fiscalYearOf("2099-12-31", 4)).toBe("2099-00");
  });
  it("rejects a malformed date or start month", () => {
    expect(() => fiscalYearOf("2026-13-01", 4)).toThrow(RangeError);
    expect(() => fiscalYearOf("01/04/2026", 4)).toThrow(RangeError);
    expect(() => fiscalYearOf("2026-04-01", 0)).toThrow(RangeError);
    expect(() => fiscalYearOf("2026-04-01", 13)).toThrow(RangeError);
    expect(() => fiscalYearOf("2026-04-01", 4.5)).toThrow(RangeError);
  });
});

describe("fiscalYearShort", () => {
  it("drops the century from both forms", () => {
    expect(fiscalYearShort("2026-27")).toBe("26-27");
    expect(fiscalYearShort("2026")).toBe("26");
    expect(fiscalYearShort("2099-00")).toBe("99-00");
  });
  it("rejects anything that is not a fiscal-year label", () => {
    expect(() => fiscalYearShort("26-27")).toThrow(RangeError);
    expect(() => fiscalYearShort("2026/27")).toThrow(RangeError);
    expect(() => fiscalYearShort("")).toThrow(RangeError);
  });
});

describe("fiscalYearRange", () => {
  it("spans 1 Apr to 31 Mar for an April start", () => {
    expect(fiscalYearRange("2026-27", 4)).toEqual({ from: "2026-04-01", to: "2027-03-31" });
  });
  it("spans the calendar year for a January start", () => {
    expect(fiscalYearRange("2026", 1)).toEqual({ from: "2026-01-01", to: "2026-12-31" });
  });
  it("handles a start month with a 31-day predecessor", () => {
    expect(fiscalYearRange("2026-27", 7)).toEqual({ from: "2026-07-01", to: "2027-06-30" });
    expect(fiscalYearRange("2025-26", 3)).toEqual({ from: "2025-03-01", to: "2026-02-28" });
  });
  it("rejects a label that does not match the start month", () => {
    expect(() => fiscalYearRange("2026", 4)).toThrow(RangeError);
    expect(() => fiscalYearRange("2026-27", 1)).toThrow(RangeError);
    expect(() => fiscalYearRange("2026-28", 4)).toThrow(RangeError);
  });
});

describe("fiscalYearsBetween", () => {
  it("lists the years touched by the range, ascending", () => {
    expect(fiscalYearsBetween("2025-12-01", "2026-05-01", 4)).toEqual(["2025-26", "2026-27"]);
    expect(fiscalYearsBetween("2024-04-01", "2027-03-31", 4)).toEqual([
      "2024-25",
      "2025-26",
      "2026-27",
    ]);
    expect(fiscalYearsBetween("2025-11-15", "2027-02-01", 1)).toEqual(["2025", "2026", "2027"]);
  });
  it("returns a single year when both dates fall in it", () => {
    expect(fiscalYearsBetween("2026-04-01", "2027-03-31", 4)).toEqual(["2026-27"]);
    expect(fiscalYearsBetween("2026-06-01", "2026-06-01", 4)).toEqual(["2026-27"]);
  });
  it("returns an empty list when from is after to", () => {
    expect(fiscalYearsBetween("2026-05-01", "2025-12-01", 4)).toEqual([]);
  });
});

describe("formatDocumentNumber", () => {
  const parts = { date: "2026-06-01", fiscalYear: "2026-27", seq: 7 };

  it("renders the default invoice and credit-note formats", () => {
    expect(formatDocumentNumber("INV/{FY}/{SEQ:3}", parts)).toBe("INV/26-27/007");
    expect(formatDocumentNumber("CN/{FY}/{SEQ:3}", parts)).toBe("CN/26-27/007");
  });
  it("renders {SEQ} without padding", () => {
    expect(formatDocumentNumber("{SEQ}", { ...parts, seq: 1234 })).toBe("1234");
  });
  it("renders the calendar tokens", () => {
    expect(formatDocumentNumber("{YYYY}{MM}-{SEQ:4}", { ...parts, seq: 12 })).toBe("202606-0012");
    expect(formatDocumentNumber("{FYYYY}/{YY}/{SEQ}", parts)).toBe("2026-27/26/7");
    expect(formatDocumentNumber("{FY}", { ...parts, fiscalYear: "2026" })).toBe("26");
  });
  it("never truncates a sequence wider than its padding", () => {
    expect(formatDocumentNumber("{SEQ:3}", { ...parts, seq: 1234 })).toBe("1234");
  });
  it("leaves unknown tokens and over-wide padding verbatim", () => {
    expect(formatDocumentNumber("{FOO}-{SEQ}", parts)).toBe("{FOO}-7");
    expect(formatDocumentNumber("{SEQ:12}", parts)).toBe("{SEQ:12}");
    expect(formatDocumentNumber("{seq}", parts)).toBe("{seq}");
  });
  it("rejects a non-integer, negative or unsafe sequence", () => {
    expect(() => formatDocumentNumber("{SEQ}", { ...parts, seq: -1 })).toThrow(RangeError);
    expect(() => formatDocumentNumber("{SEQ}", { ...parts, seq: 1.5 })).toThrow(RangeError);
    expect(() => formatDocumentNumber("{SEQ}", { ...parts, seq: Number.NaN })).toThrow(RangeError);
  });
  it("rejects a malformed date", () => {
    expect(() => formatDocumentNumber("{YYYY}-{SEQ}", { ...parts, date: "2026-6-1" })).toThrow(
      RangeError,
    );
  });
});

describe("NumberFormatSchema", () => {
  it("accepts the defaults and other well-formed formats", () => {
    expect(NumberFormatSchema.parse("INV/{FY}/{SEQ:3}")).toBe("INV/{FY}/{SEQ:3}");
    expect(NumberFormatSchema.parse("CN/{FY}/{SEQ:3}")).toBe("CN/{FY}/{SEQ:3}");
    expect(NumberFormatSchema.safeParse("{YYYY}{MM}-{SEQ:4}").success).toBe(true);
    expect(NumberFormatSchema.safeParse("ACME_{FYYYY}.{YY}-{SEQ:9}").success).toBe(true);
    expect(NumberFormatSchema.safeParse("{FY}{SEQ}").success).toBe(true);
  });
  it("requires a sequence token and a year token", () => {
    expect(NumberFormatSchema.safeParse("INV/{FY}").success).toBe(false);
    expect(NumberFormatSchema.safeParse("{SEQ}").success).toBe(false);
  });
  it("rejects spaces and other characters outside the allowed set", () => {
    expect(NumberFormatSchema.safeParse("INV {SEQ}").success).toBe(false);
    expect(NumberFormatSchema.safeParse("INV#{SEQ}").success).toBe(false);
    expect(NumberFormatSchema.safeParse("").success).toBe(false);
  });
  it("rejects formats over 40 characters", () => {
    expect(NumberFormatSchema.safeParse(`${"A".repeat(31)}{FY}{SEQ}`).success).toBe(true);
    expect(NumberFormatSchema.safeParse(`${"A".repeat(32)}{FY}{SEQ}`).success).toBe(false);
  });
  it("rejects unknown tokens and padding outside 1-9", () => {
    expect(NumberFormatSchema.safeParse("INV/{FOO}/{SEQ}").success).toBe(false);
    expect(NumberFormatSchema.safeParse("{SEQ:10}").success).toBe(false);
    expect(NumberFormatSchema.safeParse("{SEQ:0}").success).toBe(false);
  });
});

describe("safeFileStem", () => {
  it("turns slashes into dashes", () => {
    expect(safeFileStem("INV/26-27/001")).toBe("INV-26-27-001");
    expect(safeFileStem("CN/26-27/001")).toBe("CN-26-27-001");
  });
  it("replaces every other unsafe character and collapses runs", () => {
    expect(safeFileStem("A B/C\\D:E*F?G")).toBe("A-B-C-D-E-F-G");
    expect(safeFileStem("//INV//001//")).toBe("INV-001");
    expect(safeFileStem("ACME_2026.07-0001")).toBe("ACME_2026.07-0001");
  });
  it("never returns an empty stem", () => {
    expect(safeFileStem("")).toBe("document");
    expect(safeFileStem("///")).toBe("document");
  });
});
