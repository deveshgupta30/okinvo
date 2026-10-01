import "server-only";
import type { z } from "zod";
import { decryptField, encryptField, randomToken, sha256Hex } from "@/lib/crypto";
import { fieldKey } from "@/lib/crypto/key";

/**
 * How the sensitive columns are stored (review follow-up):
 * - verification tokens: the URL token is random; the row keeps its SHA-256 (the lookup key)
 *   and an encrypted copy so links and QR codes can be rebuilt. A database leak yields no
 *   usable verify links.
 * - payment-method snapshots (bank details printed on an invoice): encrypted JSON.
 */
export function tokenFields(): { verificationToken: string; verificationTokenEnc: string } {
  const plain = randomToken();
  return {
    verificationToken: sha256Hex(plain),
    verificationTokenEnc: encryptField(plain, fieldKey()),
  };
}

/** The URL token for a row, or "" when the row predates encrypted tokens (links cannot be rebuilt). */
export function tokenFromRow(enc: string | null): string {
  if (!enc) return "";
  try {
    return decryptField(enc, fieldKey());
  } catch {
    return "";
  }
}

export const tokenHash = (plain: string): string => sha256Hex(plain);

export function encryptJson(value: unknown): string {
  return encryptField(JSON.stringify(value), fieldKey());
}

/** Decrypt and validate; null when absent, unreadable or not matching the schema. */
export function decryptJson<T>(enc: string | null, schema: z.ZodType<T>): T | null {
  if (!enc) return null;
  try {
    const parsed = schema.safeParse(JSON.parse(decryptField(enc, fieldKey())));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Zod at the JSON-column boundary: a snapshot is only ever read through its schema. */
export function parseSnapshot<T>(schema: z.ZodType<T>, value: unknown): T | null {
  if (value === null || value === undefined) return null;
  const parsed = schema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
