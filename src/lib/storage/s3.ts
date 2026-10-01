import { Readable } from "node:stream";
import { buffer } from "node:stream/consumers";
import type { GetObjectCommandOutput, S3Client } from "@aws-sdk/client-s3";
import {
  StorageNotFoundError,
  type StorageAdapter,
  type StorageMeta,
  type StorageObject,
} from "./adapter";
import { assertValidKey, assertValidKeyPrefix } from "./keys";

export interface S3StorageOptions {
  endpoint: string;
  region: string;
  bucket: string;
  accessKey: string;
  secretKey: string;
}

type S3Sdk = typeof import("@aws-sdk/client-s3");
interface Loaded {
  sdk: S3Sdk;
  client: S3Client;
}

function statusOf(e: unknown): number | undefined {
  if (typeof e !== "object" || e === null || !("$metadata" in e)) return undefined;
  const meta: unknown = e.$metadata;
  if (typeof meta !== "object" || meta === null || !("httpStatusCode" in meta)) return undefined;
  return typeof meta.httpStatusCode === "number" ? meta.httpStatusCode : undefined;
}

function nameOf(e: unknown): string | undefined {
  return e instanceof Error ? e.name : undefined;
}

function isNotFound(e: unknown): boolean {
  const name = nameOf(e);
  return statusOf(e) === 404 || name === "NoSuchKey" || name === "NotFound";
}

/**
 * Any S3-compatible store (SeaweedFS, Garage, MinIO, AWS) with path-style addressing and
 * explicit credentials (v2 §11.1). `@aws-sdk/client-s3` is imported on first use so the local
 * driver never loads it. `ensureBucket()` is for boot: it creates the bucket when it is missing.
 */
export class S3Storage implements StorageAdapter {
  private readonly bucket: string;
  private loaded: Promise<Loaded> | undefined;

  constructor(private readonly options: S3StorageOptions) {
    this.bucket = options.bucket;
  }

  private load(): Promise<Loaded> {
    this.loaded ??= import("@aws-sdk/client-s3").then(
      (sdk): Loaded => ({
        sdk,
        client: new sdk.S3Client({
          endpoint: this.options.endpoint,
          region: this.options.region,
          forcePathStyle: true,
          credentials: {
            accessKeyId: this.options.accessKey,
            secretAccessKey: this.options.secretKey,
          },
        }),
      }),
      (e: unknown) => {
        this.loaded = undefined; // let the next call retry a transient import failure
        throw e;
      },
    );
    return this.loaded;
  }

  async ensureBucket(): Promise<void> {
    const { sdk, client } = await this.load();
    try {
      await client.send(new sdk.HeadBucketCommand({ Bucket: this.bucket }));
      return;
    } catch (e) {
      if (statusOf(e) !== 404) throw e;
    }
    try {
      await client.send(new sdk.CreateBucketCommand({ Bucket: this.bucket }));
    } catch (e) {
      // Another replica booting at the same moment won the race.
      const name = nameOf(e);
      if (name !== "BucketAlreadyOwnedByYou" && name !== "BucketAlreadyExists") throw e;
    }
  }

  async put(key: string, body: Buffer | Readable, meta: StorageMeta): Promise<void> {
    assertValidKey(key);
    const { sdk, client } = await this.load();
    // S3 needs the length before the first byte; a stream of unknown length is buffered.
    let payload: Buffer | Readable;
    let length: number;
    if (Buffer.isBuffer(body)) {
      payload = body;
      length = body.length;
    } else if (meta.byteSize !== undefined) {
      payload = body;
      length = meta.byteSize;
    } else {
      payload = await buffer(body);
      length = payload.length;
    }
    await client.send(
      new sdk.PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: payload,
        ContentType: meta.contentType,
        ContentLength: length,
      }),
    );
  }

  async get(key: string): Promise<StorageObject> {
    assertValidKey(key);
    const { sdk, client } = await this.load();
    let out: GetObjectCommandOutput;
    try {
      out = await client.send(new sdk.GetObjectCommand({ Bucket: this.bucket, Key: key }));
    } catch (e) {
      if (isNotFound(e)) throw new StorageNotFoundError(key);
      throw e;
    }
    if (!out.Body) throw new StorageNotFoundError(key);
    const stream =
      out.Body instanceof Readable
        ? out.Body
        : Readable.from(await out.Body.transformToByteArray());
    return {
      stream,
      contentType: out.ContentType ?? "application/octet-stream",
      byteSize: out.ContentLength ?? 0,
    };
  }

  async delete(key: string): Promise<void> {
    assertValidKey(key);
    const { sdk, client } = await this.load();
    // DeleteObject on a missing key succeeds, matching the adapter contract.
    await client.send(new sdk.DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async exists(key: string): Promise<boolean> {
    assertValidKey(key);
    const { sdk, client } = await this.load();
    try {
      await client.send(new sdk.HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch (e) {
      if (isNotFound(e)) return false;
      throw e;
    }
  }

  async *list(prefix: string): AsyncIterable<string> {
    assertValidKeyPrefix(prefix);
    const { sdk, client } = await this.load();
    let token: string | undefined;
    do {
      const page = await client.send(
        new sdk.ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
          ...(token === undefined ? {} : { ContinuationToken: token }),
        }),
      );
      for (const object of page.Contents ?? []) {
        if (object.Key !== undefined) yield object.Key;
      }
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token !== undefined);
  }
}
