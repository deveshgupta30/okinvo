import { describe, expect, it } from "vitest";
import { maskValue } from "@/lib/mask";

describe("maskValue (masked fields, addendum §3 digit-swap)", () => {
  it("hides everything but the last four characters", () => {
    expect(maskValue("ABCDE1234F")).toBe("••••••234F");
    expect(maskValue("29ABCDE1234F1Z5")).toBe("•".repeat(11) + "F1Z5");
  });

  it("keeps a different tail when asked", () => {
    expect(maskValue("1234567890", 2)).toBe("•".repeat(8) + "90");
  });

  it("masks short values completely rather than revealing them", () => {
    expect(maskValue("1234")).toBe("••••");
    expect(maskValue("12")).toBe("••");
    expect(maskValue("")).toBe("");
  });

  it("ignores surrounding whitespace in the length", () => {
    expect(maskValue("  ABCDE1234F  ")).toBe("••••••234F");
  });
});
