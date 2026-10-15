import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import {
  decryptField,
  encryptField,
  keyFromBase64,
  randomToken,
  sha256Hex,
  sha256Stream,
} from "@/lib/crypto";

const key = keyFromBase64("BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc=");

describe("field encryption", () => {
  it("round-trips and never repeats a ciphertext", () => {
    const a = encryptField("1234567890", key);
    const b = encryptField("1234567890", key);
    expect(a).not.toBe(b);
    expect(a.startsWith("v1.")).toBe(true);
    expect(decryptField(a, key)).toBe("1234567890");
    expect(decryptField(b, key)).toBe("1234567890");
  });
  it("round-trips unicode and empty strings", () => {
    expect(decryptField(encryptField("₹ £ €  日本", key), key)).toBe("₹ £ €  日本");
    expect(decryptField(encryptField("", key), key)).toBe("");
  });
  it("detects tampering", () => {
    const c = encryptField("secret", key);
    const body = c.slice(3);
    // replace the first character with one it is not, so the ciphertext always changes
    const flipped = (body[0] === "A" ? "B" : "A") + body.slice(1);
    expect(() => decryptField(`v1.${flipped}`, key)).toThrow(/integrity/);
  });
  it("rejects unknown versions and a wrong key", () => {
    expect(() => decryptField("v9.abc", key)).toThrow(/version/);
    const other = keyFromBase64("CAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAg=");
    expect(() => decryptField(encryptField("x", key), other)).toThrow(/integrity/);
  });
  it("requires a 32-byte key", () => {
    expect(() => keyFromBase64("c2hvcnQ=")).toThrow(/32/);
  });
});

describe("tokens and hashes", () => {
  it("makes base64url tokens of the expected length", () => {
    const t = randomToken();
    expect(t).toHaveLength(43);
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(randomToken(16)).toHaveLength(22);
    expect(randomToken()).not.toBe(randomToken());
  });
  it("hashes buffers, strings and streams identically", async () => {
    const expected = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
    expect(sha256Hex("abc")).toBe(expected);
    expect(sha256Hex(Buffer.from("abc"))).toBe(expected);
    expect(await sha256Stream(Readable.from([Buffer.from("a"), Buffer.from("bc")]))).toBe(expected);
  });
});
