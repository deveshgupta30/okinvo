import { describe, expect, it } from "vitest";
import { initialsOf } from "@/lib/initials";

describe("initialsOf", () => {
  it("takes the first letter of the first two words", () => {
    expect(initialsOf("Allison Murray Roy")).toBe("AM");
    expect(initialsOf("priya")).toBe("P");
    expect(initialsOf("  devesh   gupta ")).toBe("DG");
  });
  it("falls back to the e-mail's first letter when the name is empty", () => {
    expect(initialsOf("", "keshav@example.com")).toBe("K");
    expect(initialsOf("   ", "x@example.com")).toBe("X");
    expect(initialsOf("", "")).toBe("");
  });
  it("is grapheme-safe for non-Latin names", () => {
    expect(initialsOf("李 小龙")).toBe("李小");
    expect(initialsOf("अनन्या शर्मा")).toBe("अश");
    expect(initialsOf("Émile Zola")).toBe("ÉZ");
  });
});
