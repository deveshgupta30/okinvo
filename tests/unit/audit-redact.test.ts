import { describe, expect, it } from "vitest";
import { diffForAudit, redactSensitive } from "@/server/dal/audit-redact";

describe("redactSensitive", () => {
  it("masks encrypted, password, secret and token fields at any depth", () => {
    expect(
      redactSensitive({
        name: "Bank",
        detailsEnc: "v1.abc",
        nested: { password: "p", accessToken: "t", clientSecret: "s", ok: 1 },
        list: [{ usTaxIdEnc: "x" }],
      }),
    ).toEqual({
      name: "Bank",
      detailsEnc: "[redacted]",
      nested: {
        password: "[redacted]",
        accessToken: "[redacted]",
        clientSecret: "[redacted]",
        ok: 1,
      },
      list: [{ usTaxIdEnc: "[redacted]" }],
    });
  });
  it("passes primitives and null through", () => {
    expect(redactSensitive(null)).toBeNull();
    expect(redactSensitive("x")).toBe("x");
  });
});

describe("diffForAudit", () => {
  it("keeps only the keys whose values changed", () => {
    const d = diffForAudit(
      { a: 1, b: "x", c: { d: 1 }, same: true },
      { a: 2, b: "x", c: { d: 2 }, same: true },
    );
    expect(d).toEqual({ before: { a: 1, c: { d: 1 } }, after: { a: 2, c: { d: 2 } } });
  });
  it("reports added and removed keys", () => {
    expect(diffForAudit({ a: 1 }, { b: 2 })).toEqual({
      before: { a: 1 },
      after: { b: 2 },
    });
  });
  it("ignores updatedAt and treats Dates by value", () => {
    const t = new Date("2026-04-01T00:00:00Z");
    expect(
      diffForAudit({ updatedAt: new Date(1), x: t }, { updatedAt: new Date(2), x: new Date(t) }),
    ).toEqual({ before: {}, after: {} });
  });
});
