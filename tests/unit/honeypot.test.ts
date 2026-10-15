import { describe, expect, it } from "vitest";
import { HONEYPOT_FIELD, isHoneypotFilled } from "@/lib/security/honeypot";

/**
 * Spam protection on the public forms (addendum §2 item 18): a visually hidden `website` field
 * that people never see; a submission that fills it is a bot and is dropped silently.
 */
describe("isHoneypotFilled", () => {
  it("names the field", () => {
    expect(HONEYPOT_FIELD).toBe("website");
  });
  it("is false when the field is absent or empty", () => {
    expect(isHoneypotFilled(new FormData())).toBe(false);
    const fd = new FormData();
    fd.set("website", "");
    expect(isHoneypotFilled(fd)).toBe(false);
    fd.set("website", "   ");
    expect(isHoneypotFilled(fd)).toBe(false);
  });
  it("is true when a bot filled it", () => {
    const fd = new FormData();
    fd.set("website", "https://spam.example");
    expect(isHoneypotFilled(fd)).toBe(true);
  });
  it("accepts a plain record too", () => {
    expect(isHoneypotFilled({ website: "x" })).toBe(true);
    expect(isHoneypotFilled({ email: "a@b.c" })).toBe(false);
  });
});
