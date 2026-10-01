import { fileTypeFromBuffer } from "file-type";

export type UploadKind = "LOGO" | "SIGNATURE" | "STAMP" | "RECEIPT";
export type UploadContentType = "image/png" | "image/jpeg" | "image/webp" | "application/pdf";
export type UploadErrorCode = "TOO_LARGE" | "UNSUPPORTED_TYPE";

export interface UploadLimits {
  /** Cap for LOGO, SIGNATURE and STAMP uploads (`UPLOAD_MAX_IMAGE_MB`). */
  imageMb: number;
  /** Cap for RECEIPT uploads (`UPLOAD_MAX_RECEIPT_MB`). */
  receiptMb: number;
}

export class UploadError extends Error {
  override readonly name = "UploadError";
  constructor(
    readonly code: UploadErrorCode,
    message?: string,
  ) {
    super(message ?? code);
  }
}

const IMAGE_TYPES: readonly UploadContentType[] = ["image/png", "image/jpeg", "image/webp"];
const RECEIPT_TYPES: readonly UploadContentType[] = [...IMAGE_TYPES, "application/pdf"];

export function allowedTypesFor(kind: UploadKind): readonly UploadContentType[] {
  return kind === "RECEIPT" ? RECEIPT_TYPES : IMAGE_TYPES;
}

export function maxBytesFor(kind: UploadKind, limits: UploadLimits): number {
  const mb = kind === "RECEIPT" ? limits.receiptMb : limits.imageMb;
  return Math.floor(mb * 1024 * 1024);
}

function isAllowed(mime: string, allowed: readonly UploadContentType[]): mime is UploadContentType {
  return (allowed as readonly string[]).includes(mime);
}

/**
 * Enforces the per-kind size cap, then sniffs the magic bytes with `file-type` (v2 §11.2). The
 * browser-supplied MIME type is never consulted. SVG is text, which `file-type` does not detect,
 * so it (and any other unlisted type) fails with `UNSUPPORTED_TYPE`.
 */
export async function sniffAndValidate(
  buf: Buffer,
  kind: UploadKind,
  limits: UploadLimits,
): Promise<{ contentType: UploadContentType }> {
  const maxBytes = maxBytesFor(kind, limits);
  if (buf.length > maxBytes) {
    const mb = kind === "RECEIPT" ? limits.receiptMb : limits.imageMb;
    throw new UploadError("TOO_LARGE", `${kind.toLowerCase()} uploads are limited to ${mb} MB`);
  }
  const allowed = allowedTypesFor(kind);
  const sniffed = await fileTypeFromBuffer(buf);
  const mime = sniffed?.mime;
  if (mime === undefined || !isAllowed(mime, allowed)) {
    throw new UploadError(
      "UNSUPPORTED_TYPE",
      `${kind.toLowerCase()} uploads must be ${allowed.join(", ")}`,
    );
  }
  return { contentType: mime };
}
