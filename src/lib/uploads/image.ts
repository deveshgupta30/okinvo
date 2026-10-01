import sharp from "sharp";
import type { UploadKind } from "./validate";

/** Image kinds `processImage` accepts: the three profile images, or a receipt that is an image. */
export type ImageKind = Exclude<UploadKind, "RECEIPT"> | "RECEIPT_IMAGE";

export const MAX_IMAGE_DIMENSION = 1600;
export const RECEIPT_JPEG_QUALITY = 85;

export interface ProcessedImage {
  buffer: Buffer;
  contentType: "image/png" | "image/jpeg";
  width: number;
  height: number;
}

const WHITE = { r: 255, g: 255, b: 255 };

/**
 * Re-encodes an upload through sharp (v2 §11.2): applies EXIF orientation, drops all metadata
 * (sharp strips it unless asked to keep it), fits the image inside 1600×1600 without enlarging,
 * and writes PNG for LOGO/SIGNATURE/STAMP (alpha preserved) or JPEG q85 for receipt images
 * (transparency flattened onto white, since JPEG has no alpha). Rejects anything sharp cannot
 * decode, so a polyglot file never reaches storage unchanged.
 */
export async function processImage(buf: Buffer, kind: ImageKind): Promise<ProcessedImage> {
  const fitted = sharp(buf).rotate().resize({
    width: MAX_IMAGE_DIMENSION,
    height: MAX_IMAGE_DIMENSION,
    fit: "inside",
    withoutEnlargement: true,
  });
  const encoded =
    kind === "RECEIPT_IMAGE"
      ? fitted.flatten({ background: WHITE }).jpeg({ quality: RECEIPT_JPEG_QUALITY })
      : fitted.png();
  const { data, info } = await encoded.toBuffer({ resolveWithObject: true });
  return {
    buffer: data,
    contentType: kind === "RECEIPT_IMAGE" ? "image/jpeg" : "image/png",
    width: info.width,
    height: info.height,
  };
}
