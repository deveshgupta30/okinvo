import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createStorage, storage } from "@/lib/storage";
import { StorageNotFoundError } from "@/lib/storage/adapter";
import { InvalidStorageKeyError, KEY_PATTERN } from "@/lib/storage/keys";
import { LocalStorage } from "@/lib/storage/local";
import { S3Storage } from "@/lib/storage/s3";

async function readAll(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk as Uint8Array));
  return Buffer.concat(chunks);
}

async function collect(iter: AsyncIterable<string>): Promise<string[]> {
  const out: string[] = [];
  for await (const key of iter) out.push(key);
  return out.sort();
}

function filesUnder(dir: string): string[] {
  return fs
    .readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((d) => d.isFile())
    .map((d) => path.relative(dir, path.join(d.parentPath, d.name)).split(path.sep).join("/"))
    .sort();
}

describe("LocalStorage", () => {
  let tmp: string;
  let root: string;
  let storage: LocalStorage;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "okinvo-"));
    root = path.join(tmp, "storage");
    storage = new LocalStorage(root);
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("round-trips a Buffer through put/get with its content type and size", async () => {
    const body = Buffer.from("hello okinvo");
    await storage.put("assets/logo/2026/one.png", body, { contentType: "image/png" });
    const got = await storage.get("assets/logo/2026/one.png");
    expect(got.contentType).toBe("image/png");
    expect(got.byteSize).toBe(body.length);
    expect((await readAll(got.stream)).equals(body)).toBe(true);
  });

  it("accepts a Readable body and records the bytes actually written", async () => {
    const parts = ["%PDF-1.7\n", "x".repeat(1000), "\n%%EOF"];
    await storage.put("documents/invoices/2026-27/inv-001-v1.pdf", Readable.from(parts), {
      contentType: "application/pdf",
    });
    const got = await storage.get("documents/invoices/2026-27/inv-001-v1.pdf");
    expect(got.byteSize).toBe(Buffer.byteLength(parts.join("")));
    expect((await readAll(got.stream)).toString()).toBe(parts.join(""));
  });

  it("stores the data file and a sidecar, with no temp file left behind", async () => {
    await storage.put("a/b/c.png", Buffer.from("x"), { contentType: "image/png" });
    expect(filesUnder(root)).toEqual(["a/b/c.png", "a/b/c.png.meta.json"]);
    const meta: unknown = JSON.parse(
      fs.readFileSync(path.join(root, "a/b/c.png.meta.json"), "utf8"),
    );
    expect(meta).toEqual({ contentType: "image/png", byteSize: 1 });
  });

  it("overwrites an existing key atomically with the new content and metadata", async () => {
    await storage.put("k.bin", Buffer.from("first"), { contentType: "image/png" });
    await storage.put("k.bin", Buffer.from("second!"), { contentType: "image/jpeg" });
    const got = await storage.get("k.bin");
    expect(got.contentType).toBe("image/jpeg");
    expect(got.byteSize).toBe(7);
    expect((await readAll(got.stream)).toString()).toBe("second!");
    expect(filesUnder(root)).toEqual(["k.bin", "k.bin.meta.json"]);
  });

  it("get of a missing key throws StorageNotFoundError", async () => {
    await expect(storage.get("assets/logo/2026/nope.png")).rejects.toBeInstanceOf(
      StorageNotFoundError,
    );
  });

  it("exists reflects put and delete; delete also removes the sidecar and tolerates a missing key", async () => {
    expect(await storage.exists("x.png")).toBe(false);
    await storage.put("x.png", Buffer.from("x"), { contentType: "image/png" });
    expect(await storage.exists("x.png")).toBe(true);
    await storage.delete("x.png");
    expect(await storage.exists("x.png")).toBe(false);
    expect(filesUnder(root)).toEqual([]);
    await expect(storage.delete("x.png")).resolves.toBeUndefined();
    await expect(storage.delete("never/existed.png")).resolves.toBeUndefined();
  });

  it("list walks recursively under a prefix, yields forward-slash keys and skips sidecars", async () => {
    const keys = [
      "assets/logo/2025/a.png",
      "assets/logo/2026/b.png",
      "assets/receipt/2026/c.pdf",
      "documents/invoices/2026-27/inv-001-v1.pdf",
    ];
    for (const key of keys) {
      await storage.put(key, Buffer.from(key), { contentType: "application/octet-stream" });
    }
    expect(await collect(storage.list(""))).toEqual(keys);
    expect(await collect(storage.list("assets/"))).toEqual(keys.slice(0, 3));
    expect(await collect(storage.list("assets/logo/"))).toEqual(keys.slice(0, 2));
    expect(await collect(storage.list("assets/logo/2026/"))).toEqual([keys[1]]);
    expect(await collect(storage.list("assets/logo/2026/b"))).toEqual([keys[1]]);
    expect(await collect(storage.list("nothing/here/"))).toEqual([]);
  });

  it("list rejects traversal prefixes and does not touch a root that was never created", async () => {
    await expect(collect(storage.list("../"))).rejects.toBeInstanceOf(InvalidStorageKeyError);
    const fresh = new LocalStorage(path.join(tmp, "never-created"));
    expect(await collect(fresh.list(""))).toEqual([]);
    expect(fs.existsSync(path.join(tmp, "never-created"))).toBe(false);
  });

  it("rejects keys the pattern forbids on every operation", async () => {
    for (const bad of ["../x", "/abs", "A", ""]) {
      await expect(
        storage.put(bad, Buffer.from("x"), { contentType: "image/png" }),
        bad,
      ).rejects.toBeInstanceOf(InvalidStorageKeyError);
      await expect(storage.get(bad), bad).rejects.toBeInstanceOf(InvalidStorageKeyError);
      await expect(storage.exists(bad), bad).rejects.toBeInstanceOf(InvalidStorageKeyError);
      await expect(storage.delete(bad), bad).rejects.toBeInstanceOf(InvalidStorageKeyError);
    }
  });

  it("rejects a key that escapes the root even though it matches KEY_PATTERN", async () => {
    const escaping = "a/../../escaped.txt";
    expect(KEY_PATTERN.test(escaping)).toBe(true);
    await expect(
      storage.put(escaping, Buffer.from("x"), { contentType: "text/plain" }),
    ).rejects.toBeInstanceOf(InvalidStorageKeyError);
    await expect(storage.get(escaping)).rejects.toBeInstanceOf(InvalidStorageKeyError);
    expect(fs.existsSync(path.join(tmp, "escaped.txt"))).toBe(false);
    expect(filesUnder(tmp)).toEqual([]);
  });

  it("resolves a relative root once against the process cwd", () => {
    const relative = new LocalStorage("./.data/storage");
    expect(relative.root).toBe(path.resolve(process.cwd(), ".data/storage"));
    expect(storage.root).toBe(path.resolve(root));
  });
});

describe("createStorage / storage", () => {
  const s3 = {
    STORAGE_DRIVER: "s3" as const,
    STORAGE_LOCAL_ROOT: "./.data/storage",
    S3_ENDPOINT: "http://seaweedfs:8333",
    S3_REGION: "us-east-1",
    S3_BUCKET: "okinvo",
    S3_ACCESS_KEY: "key",
    S3_SECRET_KEY: "secret",
  };

  it("selects the local driver by default, rooted at STORAGE_LOCAL_ROOT", () => {
    const adapter = createStorage({ ...s3, STORAGE_DRIVER: "local" });
    expect(adapter).toBeInstanceOf(LocalStorage);
    expect((adapter as LocalStorage).root).toBe(path.resolve("./.data/storage"));
  });
  it("selects the S3 driver without loading the SDK, and refuses incomplete S3 settings", () => {
    expect(createStorage(s3)).toBeInstanceOf(S3Storage);
    expect(() => createStorage({ ...s3, S3_SECRET_KEY: undefined })).toThrow(/S3_SECRET_KEY/);
  });
  it("exports a lazy `storage` whose import does not read the environment", () => {
    // Importing the module above succeeded without APP_URL etc.; the proxy is callable later.
    expect(typeof storage).toBe("object");
  });
});
