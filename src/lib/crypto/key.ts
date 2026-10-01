import "server-only";
import { env } from "@/lib/env";
import { keyFromBase64 } from "./index";

let cached: Buffer | undefined;

/** The instance field-encryption key, decoded once from FIELD_ENCRYPTION_KEY. */
export function fieldKey(): Buffer {
  cached ??= keyFromBase64(env.FIELD_ENCRYPTION_KEY);
  return cached;
}
