import "server-only";
import { env } from "@/lib/env";
import type { ServerEnv } from "@/lib/env.schema";
import { lazyProxy } from "@/lib/lazy";
import type { StorageAdapter } from "./adapter";
import { LocalStorage } from "./local";
import { S3Storage } from "./s3";

export type { StorageAdapter, StorageMeta, StorageObject } from "./adapter";
export { StorageNotFoundError } from "./adapter";
export {
  assertValidKey,
  assertValidKeyPrefix,
  assetKey,
  documentKey,
  extensionFor,
  InvalidStorageKeyError,
  KEY_PATTERN,
  type AssetKind,
  type DocumentKeyKind,
  type StoredExtension,
} from "./keys";
export { LocalStorage } from "./local";
export { S3Storage, type S3StorageOptions } from "./s3";

export type StorageEnv = Pick<
  ServerEnv,
  | "STORAGE_DRIVER"
  | "STORAGE_LOCAL_ROOT"
  | "S3_ENDPOINT"
  | "S3_REGION"
  | "S3_BUCKET"
  | "S3_ACCESS_KEY"
  | "S3_SECRET_KEY"
>;

/** Builds the adapter the configuration selects. Pure: the caller supplies the values. */
export function createStorage(config: StorageEnv): StorageAdapter {
  if (config.STORAGE_DRIVER !== "s3") return new LocalStorage(config.STORAGE_LOCAL_ROOT);
  // env.schema already requires these when STORAGE_DRIVER=s3; this narrows the optional types.
  if (!config.S3_ENDPOINT || !config.S3_ACCESS_KEY || !config.S3_SECRET_KEY) {
    throw new Error("STORAGE_DRIVER=s3 requires S3_ENDPOINT, S3_ACCESS_KEY and S3_SECRET_KEY");
  }
  return new S3Storage({
    endpoint: config.S3_ENDPOINT,
    region: config.S3_REGION,
    bucket: config.S3_BUCKET,
    accessKey: config.S3_ACCESS_KEY,
    secretKey: config.S3_SECRET_KEY,
  });
}

/** The configured adapter. Reads the environment on first use, never on import. */
export const storage: StorageAdapter = lazyProxy(() => createStorage(env));
