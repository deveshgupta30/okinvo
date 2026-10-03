import { randomInt } from "node:crypto";
import { EFF_SHORT_WORDLIST } from "./eff-short-wordlist";

/**
 * Passphrases for protected PDFs and share links (spec §5.5). Six words from the EFF short list
 * give log2(1296^6) ≈ 62 bits; words come from the CSPRNG and are joined with hyphens so the
 * phrase stays inside the keyboard charset and is easy to read out over the phone.
 */
export const WORDS: readonly string[] = EFF_SHORT_WORDLIST;

export function generatePassphrase(words = 6): string {
  if (!Number.isInteger(words) || words < 3 || words > 12) {
    throw new RangeError("a passphrase has between 3 and 12 words");
  }
  const out: string[] = [];
  for (let i = 0; i < words; i++) out.push(WORDS[randomInt(WORDS.length)]!);
  return out.join("-");
}

// The strength estimate is browser-safe and lives in ./password-strength; re-exported here.
export { passwordStrength, type PasswordStrength } from "./password-strength";
