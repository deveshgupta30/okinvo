import { sha256Hex } from "@/lib/crypto";
import { extensionFor, type StoredExtension } from "@/lib/storage/keys";
import { processImage } from "./image";
import {
  UploadError,
  sniffAndValidate,
  type UploadContentType,
  type UploadKind,
  type UploadLimits,
} from "./validate";

export * from "./image";
export * from "./validate";

/** What `/api/uploads` writes to storage and records on `Asset`. */
export interface PreparedUpload {
  buffer: Buffer;
  contentType: UploadContentType;
  ext: StoredExtension;
  byteSize: number;
  sha256: string;
  /** Present for images; absent for PDF receipts. */
  width?: number;
  height?: number;
}

/**
 * The upload pipeline of v2 §11.2 steps 2-5 minus the I/O: size cap and magic-byte sniff, then
 * images are re-encoded through sharp (receipt images become JPEG) while PDF receipts are kept
 * byte-for-byte, and the stored bytes are hashed. Throws `UploadError` for a bad upload.
 */
export async function prepareUpload(
  buf: Buffer,
  kind: UploadKind,
  limits: UploadLimits,
): Promise<PreparedUpload> {
  const { contentType } = await sniffAndValidate(buf, kind, limits);
  if (contentType === "application/pdf") {
    return { buffer: buf, contentType, ext: "pdf", byteSize: buf.length, sha256: sha256Hex(buf) };
  }
  // Magic bytes passed but the decoder could not read it: a truncated or forged file, refused
  // like any other unsupported type rather than surfacing as a server error.
  const image = await processImage(buf, kind === "RECEIPT" ? "RECEIPT_IMAGE" : kind).catch(() => {
    throw new UploadError("UNSUPPORTED_TYPE", "The image could not be decoded.");
  });
  return {
    buffer: image.buffer,
    contentType: image.contentType,
    ext: extensionFor(image.contentType),
    byteSize: image.buffer.length,
    sha256: sha256Hex(image.buffer),
    width: image.width,
    height: image.height,
  };
}
