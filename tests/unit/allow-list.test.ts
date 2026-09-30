import { describe, expect, it } from "vitest";
import { isAllowedEmail, parseAllowedEmails } from "@/server/allow-list";

describe("parseAllowedEmails", () => {
  it("normalises whitespace, case and trailing commas", () => {
    const list = parseAllowedEmails(" Me@Example.COM, *@Corp.io ,");
    expect([...list.emails]).toEqual(["me@example.com"]);
    expect([...list.domains]).toEqual(["corp.io"]);
  });
  it("returns empty sets for undefined or blank input", () => {
    expect(parseAllowedEmails(undefined).emails.size).toBe(0);
    expect(parseAllowedEmails("  ").domains.size).toBe(0);
  });
  it("rejects a bare wildcard and malformed entries", () => {
    expect(() => parseAllowedEmails("*")).toThrow(/invalid entry "\*"/);
    expect(() => parseAllowedEmails("*@")).toThrow(/invalid domain pattern/);
    expect(() => parseAllowedEmails("not-an-email")).toThrow(/invalid entry/);
  });
});

describe("isAllowedEmail", () => {
  const list = parseAllowedEmails("me@example.com,*@corp.io");
  it("matches exact addresses and domain patterns case-insensitively", () => {
    expect(isAllowedEmail("ME@example.com", list)).toBe(true);
    expect(isAllowedEmail("anyone@CORP.io", list)).toBe(true);
  });
  it("rejects other addresses, sub-domains and junk", () => {
    expect(isAllowedEmail("me@example.org", list)).toBe(false);
    expect(isAllowedEmail("a@sub.corp.io", list)).toBe(false);
    expect(isAllowedEmail("@corp.io", list)).toBe(false);
    expect(isAllowedEmail("", list)).toBe(false);
  });
});
