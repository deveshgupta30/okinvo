import { describe, expect, it } from "vitest";
import { API_KEY_RE, generateApiKey, hashApiKey, isApiKey } from "@/lib/api/keys";
import { effectiveScopes, isScope, READ_SCOPES, SCOPES, scopesForRole } from "@/lib/api/scopes";

/** API keys and scopes (spec §7.1). */
describe("generateApiKey", () => {
  it("makes okv_ keys of 43 base64url characters with a 12-character prefix and a SHA-256 hash", () => {
    const k = generateApiKey();
    expect(k.key).toMatch(API_KEY_RE);
    expect(k.prefix).toBe(k.key.slice(0, 12));
    expect(k.prefix.startsWith("okv_")).toBe(true);
    expect(k.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashApiKey(k.key)).toBe(k.hash);
    expect(isApiKey(k.key)).toBe(true);
    expect(isApiKey("okv_short")).toBe(false);
    expect(isApiKey("eyJhbGciOi...")).toBe(false);
  });
  it("never repeats", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) seen.add(generateApiKey().key);
    expect(seen.size).toBe(200);
  });
});

describe("scopes", () => {
  it("viewers get the read scopes only; editors and owners everything", () => {
    expect(scopesForRole("VIEWER")).toEqual([...READ_SCOPES]);
    expect(scopesForRole("EDITOR")).toEqual([...SCOPES]);
    expect(scopesForRole("OWNER")).toEqual([...SCOPES]);
    expect(READ_SCOPES.every((s) => s.endsWith(":read"))).toBe(true);
    expect(isScope("invoices:read")).toBe(true);
    expect(isScope("invoices:delete")).toBe(false);
  });
  it("effective scopes are the intersection with the current ceiling, in catalogue order", () => {
    expect(effectiveScopes(["invoices:create", "invoices:read", "bogus"], "VIEWER")).toEqual([
      "invoices:read",
    ]);
    expect(effectiveScopes(["status:read", "invoices:create"], "EDITOR")).toEqual([
      "invoices:create",
      "status:read",
    ]);
    expect(effectiveScopes([], "OWNER")).toEqual([]);
  });
});
