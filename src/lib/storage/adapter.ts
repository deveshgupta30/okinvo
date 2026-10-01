import type { Readable } from "node:stream";

/**
 * Blob storage contract (v2 §11.1). Every blob the app keeps — uploaded assets and rendered
 * documents — goes through an implementation of this interface; callers store the **key**, never
 * a URL, and nothing behind it is reachable without going through `/api/assets` or
 * `/api/documents`.
 */
export interface StorageMeta {
  contentType: string;
  /** Length of `body` when known up front; lets drivers stream instead of buffering. */
  byteSize?: number;
}

export interface StorageObject {
  stream: Readable;
  contentType: string;
  byteSize: number;
}

export interface StorageAdapter {
  put(key: string, body: Buffer | Readable, meta: StorageMeta): Promise<void>;
  /** Rejects with `StorageNotFoundError` when the key has no object. */
  get(key: string): Promise<StorageObject>;
  /** Idempotent: deleting a missing key is not an error. */
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  /** Every key starting with `prefix` (forward-slash form), for backups and orphan sweeps. */
  list(prefix: string): AsyncIterable<string>;
}

export class StorageNotFoundError extends Error {
  override readonly name = "StorageNotFoundError";
  constructor(readonly key: string) {
    super(`storage object not found: ${key}`);
  }
}
