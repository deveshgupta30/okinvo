import { describe, expect, it } from "vitest";
import {
  KEY_PATTERN,
  assertValidKey,
  assetKey,
  documentKey,
  extensionFor,
  InvalidStorageKeyError,
} from "@/lib/storage/keys";

describe("assertValidKey", () => {
  it("accepts the key shapes the app produces", () => {
    expect(() =>
      assertValidKey("assets/logo/2026/0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b.png"),
    ).not.toThrow();
    expect(() => assertValidKey("documents/invoices/2026-27/inv-26-27-001-v1.pdf")).not.toThrow();
    expect(() => assertValidKey("a_b-c.d")).not.toThrow();
  });
  it("rejects traversal, absolute, uppercase and empty keys", () => {
    for (const bad of ["../x", "a/../b", "..", "/abs", "/", "A", "assets/Logo/x.png", ""]) {
      expect(() => assertValidKey(bad), bad).toThrow(InvalidStorageKeyError);
    }
  });
  it("rejects empty, dot and backslash segments and the reserved sidecar suffix", () => {
    for (const bad of ["a//b", "a/", "a/./b", "a/.hidden", "a\\b", "x.meta.json", "a b"]) {
      expect(() => assertValidKey(bad), bad).toThrow(InvalidStorageKeyError);
    }
  });
  it("exposes KEY_PATTERN, which alone does not catch dotted traversal (assertValidKey does)", () => {
    expect(KEY_PATTERN.test("assets/logo/2026/x.png")).toBe(true);
    expect(KEY_PATTERN.test("A")).toBe(false);
    expect(KEY_PATTERN.test("/abs")).toBe(false);
    expect(KEY_PATTERN.test("a/../../x")).toBe(true);
    expect(() => assertValidKey("a/../../x")).toThrow(InvalidStorageKeyError);
  });
});

describe("assetKey", () => {
  const id = "0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b";
  it("partitions by lower-cased kind and UTC year", () => {
    const now = new Date("2026-04-01T00:00:00Z");
    expect(assetKey("LOGO", id, "png", now)).toBe(`assets/logo/2026/${id}.png`);
    expect(assetKey("SIGNATURE", id, "png", now)).toBe(`assets/signature/2026/${id}.png`);
    expect(assetKey("STAMP", id, "webp", now)).toBe(`assets/stamp/2026/${id}.webp`);
    expect(assetKey("RECEIPT", id, "pdf", now)).toBe(`assets/receipt/2026/${id}.pdf`);
    expect(assetKey("RECEIPT", id, "jpg", new Date("2025-12-31T23:59:59Z"))).toBe(
      `assets/receipt/2025/${id}.jpg`,
    );
  });
  it("defaults to the current year and always yields a valid key", () => {
    const key = assetKey("LOGO", id, "png");
    expect(key).toMatch(/^assets\/logo\/\d{4}\/[0-9a-f-]+\.png$/);
    expect(() => assertValidKey(key)).not.toThrow();
  });
  it("refuses an id that would make the key invalid", () => {
    expect(() => assetKey("LOGO", "../x", "png")).toThrow(InvalidStorageKeyError);
    expect(() => assetKey("LOGO", "ABC", "png")).toThrow(InvalidStorageKeyError);
  });
});

describe("documentKey", () => {
  // Numbers are unique per issuer profile (SPEC §4.6), so the key must carry the issuer too:
  // two profiles both issuing INV/26-27/001 must never share (or overwrite) one blob.
  const issuer = "01a0f6d7-852b-75cb-81dc-cfe6142f3f57";
  it("places documents under issuer, kind and fiscal year with a version suffix", () => {
    expect(documentKey("INVOICE", issuer, "2026-27", "inv-26-27-001", 1)).toBe(
      `documents/invoices/${issuer}/2026-27/inv-26-27-001-v1.pdf`,
    );
    expect(documentKey("CREDIT_NOTE", issuer, "2026-27", "cn-26-27-004", 3)).toBe(
      `documents/credit-notes/${issuer}/2026-27/cn-26-27-004-v3.pdf`,
    );
  });
  it("gives different issuers different keys for the same number", () => {
    const other = "01a0f6d8-4b14-73dc-8a88-2af67b29c477";
    expect(documentKey("INVOICE", issuer, "2026-27", "inv-26-27-001", 1)).not.toBe(
      documentKey("INVOICE", other, "2026-27", "inv-26-27-001", 1),
    );
  });
  it("refuses an unsafe number, issuer or fiscal year and a non-positive version", () => {
    expect(() => documentKey("INVOICE", issuer, "2026-27", "INV/26-27/001", 1)).toThrow(
      InvalidStorageKeyError,
    );
    expect(() => documentKey("INVOICE", "../x", "2026-27", "inv-001", 1)).toThrow(
      InvalidStorageKeyError,
    );
    expect(() => documentKey("INVOICE", issuer, "../2026", "inv-001", 1)).toThrow(
      InvalidStorageKeyError,
    );
    expect(() => documentKey("INVOICE", issuer, "2026-27", "inv-001", 0)).toThrow(RangeError);
    expect(() => documentKey("INVOICE", issuer, "2026-27", "inv-001", 1.5)).toThrow(RangeError);
  });
});

describe("extensionFor", () => {
  it("maps the four stored content types", () => {
    expect(extensionFor("image/png")).toBe("png");
    expect(extensionFor("image/jpeg")).toBe("jpg");
    expect(extensionFor("image/webp")).toBe("webp");
    expect(extensionFor("application/pdf")).toBe("pdf");
  });
  it("throws for anything else, including SVG", () => {
    expect(() => extensionFor("image/svg+xml")).toThrow(/unsupported content type/);
    expect(() => extensionFor("")).toThrow(/unsupported content type/);
  });
});
