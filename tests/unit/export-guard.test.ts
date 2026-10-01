import { describe, expect, it } from "vitest";
import { RISKY, guardCell } from "@/lib/exports/guard";

describe("guardCell", () => {
  it("prefixes the OWASP formula triggers with an apostrophe", () => {
    expect(guardCell("=1+1")).toBe("'=1+1");
    expect(guardCell("+1")).toBe("'+1");
    expect(guardCell("-1")).toBe("'-1");
    expect(guardCell("@SUM(A1:A3)")).toBe("'@SUM(A1:A3)");
    expect(guardCell("\tx")).toBe("'\tx");
    expect(guardCell("\rx")).toBe("'\rx");
  });
  it("guards the classic payloads", () => {
    expect(guardCell('=cmd|" /C calc"!A0')).toBe('\'=cmd|" /C calc"!A0');
    expect(guardCell('=HYPERLINK("http://evil","click")')).toBe(
      '\'=HYPERLINK("http://evil","click")',
    );
    expect(guardCell("-2+3+cmd|' /C calc'!A0")).toBe("'-2+3+cmd|' /C calc'!A0");
  });
  it("leaves ordinary text untouched", () => {
    expect(guardCell("hello")).toBe("hello");
    expect(guardCell("")).toBe("");
    expect(guardCell("a=b")).toBe("a=b");
    expect(guardCell("5")).toBe("5");
    expect(guardCell("Acme (Pvt) Ltd.")).toBe("Acme (Pvt) Ltd.");
    expect(guardCell("'=1+1")).toBe("'=1+1");
  });
  it("looks past leading whitespace and line breaks, which spreadsheets trim", () => {
    expect(guardCell(" =1+1")).toBe("' =1+1");
    expect(guardCell("\n=1+1")).toBe("'\n=1+1");
    expect(guardCell("\t\t+1")).toBe("'\t\t+1");
    expect(guardCell("  plain")).toBe("  plain");
  });
  it("catches full-width ＝ ＋ － ＠, which Excel folds to their ASCII forms", () => {
    expect(guardCell("＝1+1")).toBe("'＝1+1");
    expect(guardCell("＋1")).toBe("'＋1");
    expect(guardCell("－1")).toBe("'－1");
    expect(guardCell("＠SUM(A1)")).toBe("'＠SUM(A1)");
  });
  it("treats a negative-looking text cell as text (numbers are the writer's job)", () => {
    expect(guardCell("-5")).toBe("'-5");
  });
  it("removes NUL bytes, including a NUL hiding a formula trigger", () => {
    expect(guardCell("\u0000=1+1")).toBe("'=1+1");
    expect(guardCell("he\u0000llo")).toBe("hello");
    expect(guardCell("\u0000")).toBe("");
  });
  it("guards triggers after a stripped NUL and at the first character only", () => {
    expect(guardCell("=\u0000x")).toBe("'=x");
    expect(guardCell("x\t=1")).toBe("x\t=1");
  });
});

describe("RISKY", () => {
  it("matches only at the start of the cell", () => {
    expect(RISKY.test("=x")).toBe(true);
    expect(RISKY.test("@x")).toBe(true);
    expect(RISKY.test("\tx")).toBe(true);
    expect(RISKY.test("\rx")).toBe(true);
    expect(RISKY.test("x=")).toBe(false);
    expect(RISKY.test("")).toBe(false);
  });
});
