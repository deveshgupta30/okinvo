import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Field-level encryption (AES-256-GCM) for payment-method details, US tax IDs and the stored SMTP
 * password; random tokens for verification; SHA-256 helpers for documents. The key is passed in
 * explicitly so this module stays pure; `src/lib/crypto/key.ts` resolves it from the environment.
 */
const VERSION = "v1";
const IV_BYTES = 12;
const TAG_BYTES = 16;

export function keyFromBase64(b64: string): Buffer {
  const key = Buffer.from(b64, "base64");
  if (key.length !== 32) throw new Error("FIELD_ENCRYPTION_KEY must decode to exactly 32 bytes");
  return key;
}

export function encryptField(plaintext: string, key: Buffer): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${VERSION}.${Buffer.concat([iv, tag, ciphertext]).toString("base64url")}`;
}

export function decryptField(stored: string, key: Buffer): string {
  const dot = stored.indexOf(".");
  const version = dot === -1 ? stored : stored.slice(0, dot);
  if (version !== VERSION) throw new Error(`unsupported ciphertext version: ${version}`);
  const raw = Buffer.from(stored.slice(dot + 1), "base64url");
  if (raw.length < IV_BYTES + TAG_BYTES) throw new Error("ciphertext integrity check failed");
  const iv = raw.subarray(0, IV_BYTES);
  const tag = raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const body = raw.subarray(IV_BYTES + TAG_BYTES);
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8");
  } catch {
    throw new Error("ciphertext integrity check failed");
  }
}

/** base64url without padding; 32 bytes → 43 characters. Used for verification tokens. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256Hex(data: Buffer | Uint8Array | string): string {
  return createHash("sha256").update(data).digest("hex");
}

export function sha256Stream(stream: NodeJS.ReadableStream): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    stream.on("data", (chunk: Buffer | string) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}
