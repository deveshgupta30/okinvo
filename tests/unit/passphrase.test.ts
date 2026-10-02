import { describe, expect, it } from "vitest";
import { generatePassphrase, passwordStrength, WORDS } from "@/lib/security/passphrase";

/** Passphrases for protected PDFs and share links (spec §5.5). */
describe("generatePassphrase", () => {
  it("uses the 1 296-word EFF short list", () => {
    expect(WORDS).toHaveLength(1296);
    expect(new Set(WORDS).size).toBe(1296);
    expect(WORDS.every((w) => /^[a-z-]+$/.test(w))).toBe(true);
  });
  it("joins six list words with hyphens by default", () => {
    const p = generatePassphrase();
    const parts = p.split("-").filter(Boolean);
    // "yo-yo" is the one word with its own hyphen
    expect(parts.length).toBeGreaterThanOrEqual(6);
    for (const w of p.split(/-(?!yo$)/)) expect(WORDS).toContain(w);
    expect(generatePassphrase(4).split("-").length).toBeGreaterThanOrEqual(4);
  });
  it("is distinct across a hundred draws", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 100; i++) seen.add(generatePassphrase());
    expect(seen.size).toBe(100);
  });
  it("refuses silly word counts", () => {
    expect(() => generatePassphrase(2)).toThrow(RangeError);
    expect(() => generatePassphrase(13)).toThrow(RangeError);
  });
});

describe("passwordStrength", () => {
  it("scores from unusable to strong", () => {
    expect(passwordStrength("a").score).toBe(0);
    expect(passwordStrength("").score).toBe(0);
    expect(passwordStrength("password").score).toBe(1);
    expect(passwordStrength("Password1").score).toBe(2);
    expect(passwordStrength("Tr0ub4dor&3xyz!!").score).toBe(4);
    expect(passwordStrength("aB3$efGh9!kLmN0pQr2s").score).toBe(4);
    expect(passwordStrength(generatePassphrase()).score).toBe(4);
    expect(passwordStrength("a").label).toBe("very weak");
    expect(passwordStrength("aB3$efGh9!kLmN0pQr2s").label).toBe("strong");
  });
});
