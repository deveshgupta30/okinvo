import { describe, expect, it } from "vitest";
import { firstNameOf } from "@/lib/names";

describe("firstNameOf", () => {
  it("returns the first word of the display name", () => {
    expect(firstNameOf("Allison Murray Roy", "a@example.com")).toBe("Allison");
    expect(firstNameOf("  devesh gupta ", "d@example.com")).toBe("devesh");
    expect(firstNameOf("李小龙", "l@example.com")).toBe("李小龙");
  });
  it("falls back to the e-mail's local part, and finally to 'there'", () => {
    expect(firstNameOf("", "keshav.gupta@example.com")).toBe("keshav.gupta");
    expect(firstNameOf("   ", "")).toBe("there");
  });
});
