import { randomBytes } from "node:crypto";
import { createReadStream, type Dirent, type Stats } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import type { Readable } from "node:stream";
import { z } from "zod";
import {
  StorageNotFoundError,
  type StorageAdapter,
  type StorageMeta,
  type StorageObject,
} from "./adapter";
import {
  assertValidKey,
  assertValidKeyPrefix,
  InvalidStorageKeyError,
  SIDECAR_SUFFIX,
} from "./keys";

const sidecarSchema = z.object({
  contentType: z.string().min(1),
  byteSize: z.number().int().nonnegative(),
});

const FALLBACK_CONTENT_TYPE = "application/octet-stream";

function errnoCode(e: unknown): string | undefined {
  return typeof e === "object" && e !== null && "code" in e && typeof e.code === "string"
    ? e.code
    : undefined;
}

async function statOrUndefined(file: string): Promise<Stats | undefined> {
  try {
    return await fs.stat(file);
  } catch (e) {
    if (errnoCode(e) === "ENOENT" || errnoCode(e) === "ENOTDIR") return undefined;
    throw e;
  }
}

async function removeFile(file: string): Promise<void> {
  const stat = await statOrUndefined(file);
  if (stat?.isFile()) await fs.rm(file, { force: true });
}

/**
 * Files under one root directory (the default driver; `STORAGE_LOCAL_ROOT`, a named volume in
 * Compose). Each object is `<root>/<key>` plus a sidecar `<key>.meta.json` holding
 * `{ contentType, byteSize }`. Writes go to a dot-prefixed temp file in the same directory and
 * are renamed into place, so a reader never sees a partial object. Valid keys never contain a
 * dot-led segment, so temp files and foreign dot-files are invisible to `list`.
 */
export class LocalStorage implements StorageAdapter {
  readonly root: string;
  private readonly rootPrefix: string;

  constructor(root: string) {
    this.root = path.resolve(root);
    this.rootPrefix = this.root.endsWith(path.sep) ? this.root : this.root + path.sep;
  }

  /** Validates `key` and maps it to an absolute path strictly inside the root. */
  private resolve(key: string): string {
    assertValidKey(key);
    const full = path.resolve(this.root, key);
    if (!full.startsWith(this.rootPrefix)) {
      throw new InvalidStorageKeyError(key, "resolves outside the storage root");
    }
    return full;
  }

  async put(key: string, body: Buffer | Readable, meta: StorageMeta): Promise<void> {
    const full = this.resolve(key);
    const dir = path.dirname(full);
    const base = path.basename(full);
    const token = randomBytes(6).toString("hex");
    const dataTmp = path.join(dir, `.${base}.${token}.tmp`);
    const metaTmp = path.join(dir, `.${base}${SIDECAR_SUFFIX}.${token}.tmp`);
    await fs.mkdir(dir, { recursive: true });
    try {
      await fs.writeFile(dataTmp, body, { flag: "wx" });
      const { size: byteSize } = await fs.stat(dataTmp);
      if (meta.byteSize !== undefined && meta.byteSize !== byteSize) {
        throw new Error(
          `storage put ${key}: body is ${byteSize} bytes but ${meta.byteSize} were declared`,
        );
      }
      const sidecar = sidecarSchema.parse({ contentType: meta.contentType, byteSize });
      await fs.writeFile(metaTmp, JSON.stringify(sidecar), { encoding: "utf8", flag: "wx" });
      // Two renames: on an overwrite there is a brief window with new data and old metadata,
      // which only affects the sidecar's content type, never the bytes served.
      await fs.rename(dataTmp, full);
      await fs.rename(metaTmp, full + SIDECAR_SUFFIX);
    } catch (e) {
      await Promise.all([fs.rm(dataTmp, { force: true }), fs.rm(metaTmp, { force: true })]);
      throw e;
    }
  }

  async get(key: string): Promise<StorageObject> {
    const full = this.resolve(key);
    const stat = await statOrUndefined(full);
    if (!stat?.isFile()) throw new StorageNotFoundError(key);
    const sidecar = await this.readSidecar(full + SIDECAR_SUFFIX);
    return {
      stream: createReadStream(full),
      contentType: sidecar?.contentType ?? FALLBACK_CONTENT_TYPE,
      byteSize: stat.size,
    };
  }

  async delete(key: string): Promise<void> {
    const full = this.resolve(key);
    await Promise.all([removeFile(full), removeFile(full + SIDECAR_SUFFIX)]);
  }

  async exists(key: string): Promise<boolean> {
    const stat = await statOrUndefined(this.resolve(key));
    return stat?.isFile() ?? false;
  }

  async *list(prefix: string): AsyncIterable<string> {
    assertValidKeyPrefix(prefix);
    // Start the walk at the deepest directory the prefix fully names.
    const dirPart = prefix.slice(0, prefix.lastIndexOf("/") + 1);
    const start = dirPart === "" ? this.root : path.resolve(this.root, dirPart);
    if (start !== this.root && !start.startsWith(this.rootPrefix)) {
      throw new InvalidStorageKeyError(prefix, "resolves outside the storage root");
    }
    yield* this.walk(start, prefix);
  }

  private async *walk(dir: string, prefix: string): AsyncGenerator<string, void, undefined> {
    let entries: Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (e) {
      if (errnoCode(e) === "ENOENT" || errnoCode(e) === "ENOTDIR") return;
      throw e;
    }
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue; // temp files and foreign dot-files
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        yield* this.walk(full, prefix);
        continue;
      }
      if (!entry.isFile() || entry.name.endsWith(SIDECAR_SUFFIX)) continue;
      const key = path.relative(this.root, full).split(path.sep).join("/");
      if (!key.startsWith(prefix)) continue;
      try {
        assertValidKey(key);
      } catch {
        continue; // a foreign file (uppercase, odd characters) is not an object we wrote
      }
      yield key;
    }
  }

  private async readSidecar(file: string): Promise<z.infer<typeof sidecarSchema> | undefined> {
    let raw: string;
    try {
      raw = await fs.readFile(file, "utf8");
    } catch (e) {
      if (errnoCode(e) === "ENOENT" || errnoCode(e) === "ENOTDIR") return undefined;
      throw e;
    }
    const parsed = sidecarSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : undefined;
  }
}
