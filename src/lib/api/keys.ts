import { randomBytes } from "node:crypto";
import { sha256Hex } from "@/lib/crypto";

/**
 * API key format (spec §7.1): `okv_` + 43 base64url characters (32 random bytes). Only the
 * SHA-256 hash is stored; the prefix (the first 12 characters) is kept for display.
 */
export const API_KEY_PREFIX = "okv_";
export const API_KEY_RE = /^okv_[A-Za-z0-9_-]{43}$/;

export interface GeneratedApiKey {
  key: string;
  prefix: string;
  hash: string;
}

export function generateApiKey(): GeneratedApiKey {
  const key = `${API_KEY_PREFIX}${randomBytes(32).toString("base64url")}`;
  return { key, prefix: key.slice(0, 12), hash: sha256Hex(key) };
}

export function isApiKey(v: string): boolean {
  return API_KEY_RE.test(v);
}

export function hashApiKey(key: string): string {
  return sha256Hex(key);
}
