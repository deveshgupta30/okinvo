import sharp from "sharp";
import { beforeAll, describe, expect, it } from "vitest";
import { sha256Hex } from "@/lib/crypto";
import { prepareUpload, processImage, sniffAndValidate, UploadError } from "@/lib/uploads";

const MB = 1024 * 1024;
const limits = { imageMb: 2, receiptMb: 10 };

/** A transparent 2000×1000 RGBA canvas with one opaque red pixel so alpha is meaningful. */
async function makePng(width = 2000, height = 1000): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([
      {
        input: {
          create: {
            width: 1,
            height: 1,
            channels: 4,
            background: { r: 255, g: 0, b: 0, alpha: 1 },
          },
        },
        left: 0,
        top: 0,
      },
    ])
    .png()
    .toBuffer();
}

async function makeJpeg(width = 200, height = 100, orientation?: number): Promise<Buffer> {
  let pipeline = sharp({
    create: { width, height, channels: 3, background: { r: 10, g: 20, b: 30 } },
  }).jpeg();
  if (orientation !== undefined) pipeline = pipeline.withMetadata({ orientation });
  return pipeline.toBuffer();
}

async function makeWebp(): Promise<Buffer> {
  return sharp({ create: { width: 40, height: 30, channels: 3, background: { r: 1, g: 2, b: 3 } } })
    .webp()
    .toBuffer();
}

const svg = Buffer.from(
  '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>',
);
const pdf = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
);

async function code(p: Promise<unknown>): Promise<string | undefined> {
  try {
    await p;
    return undefined;
  } catch (e) {
    return e instanceof UploadError ? e.code : `not an UploadError: ${String(e)}`;
  }
}

let png: Buffer;
let jpeg: Buffer;
let webp: Buffer;
beforeAll(async () => {
  [png, jpeg, webp] = await Promise.all([makePng(), makeJpeg(), makeWebp()]);
});

describe("sniffAndValidate", () => {
  it("treats AVATAR like the other image kinds: images only, image cap", async () => {
    await expect(sniffAndValidate(webp, "AVATAR", limits)).resolves.toEqual({
      contentType: "image/webp",
    });
    expect(await code(sniffAndValidate(pdf, "AVATAR", limits))).toBe("UNSUPPORTED_TYPE");
  });
  it("accepts PNG, JPEG and WebP for the image kinds by magic bytes", async () => {
    for (const kind of ["LOGO", "SIGNATURE", "STAMP"] as const) {
      expect(await sniffAndValidate(png, kind, limits)).toEqual({ contentType: "image/png" });
      expect(await sniffAndValidate(jpeg, kind, limits)).toEqual({ contentType: "image/jpeg" });
      expect(await sniffAndValidate(webp, kind, limits)).toEqual({ contentType: "image/webp" });
    }
  });
  it("rejects SVG as UNSUPPORTED_TYPE for every kind", async () => {
    for (const kind of ["LOGO", "SIGNATURE", "STAMP", "RECEIPT"] as const) {
      expect(await code(sniffAndValidate(svg, kind, limits)), kind).toBe("UNSUPPORTED_TYPE");
    }
  });
  it("refuses a corrupt image (valid magic bytes, unreadable data) as unsupported", async () => {
    const corrupt = Buffer.concat([png.subarray(0, 24), Buffer.from("not really a png")]);
    expect(await code(prepareUpload(corrupt, "RECEIPT", limits))).toBe("UNSUPPORTED_TYPE");
  });

  it("allows PDF only for RECEIPT", async () => {
    expect(await sniffAndValidate(pdf, "RECEIPT", limits)).toEqual({
      contentType: "application/pdf",
    });
    for (const kind of ["LOGO", "SIGNATURE", "STAMP"] as const) {
      expect(await code(sniffAndValidate(pdf, kind, limits)), kind).toBe("UNSUPPORTED_TYPE");
    }
  });
  it("rejects a 3 MB image as TOO_LARGE at a 2 MB image cap, but accepts it as a 10 MB receipt", async () => {
    const big = Buffer.concat([png, Buffer.alloc(3 * MB - png.length)]);
    expect(big.length).toBe(3 * MB);
    expect(await code(sniffAndValidate(big, "LOGO", limits))).toBe("TOO_LARGE");
    expect(await sniffAndValidate(big, "RECEIPT", limits)).toEqual({ contentType: "image/png" });
    expect(await code(sniffAndValidate(big, "RECEIPT", { imageMb: 2, receiptMb: 1 }))).toBe(
      "TOO_LARGE",
    );
  });
  it("treats the cap as inclusive and checks size before sniffing", async () => {
    const exactly = Buffer.concat([png, Buffer.alloc(2 * MB - png.length)]);
    expect(await sniffAndValidate(exactly, "LOGO", limits)).toEqual({ contentType: "image/png" });
    const junk = Buffer.alloc(2 * MB + 1, 0xff);
    expect(await code(sniffAndValidate(junk, "LOGO", limits))).toBe("TOO_LARGE");
  });
  it("rejects unknown bytes, text and an empty buffer as UNSUPPORTED_TYPE", async () => {
    expect(await code(sniffAndValidate(Buffer.from("just some text"), "LOGO", limits))).toBe(
      "UNSUPPORTED_TYPE",
    );
    expect(await code(sniffAndValidate(Buffer.alloc(64, 0xab), "RECEIPT", limits))).toBe(
      "UNSUPPORTED_TYPE",
    );
    expect(await code(sniffAndValidate(Buffer.alloc(0), "LOGO", limits))).toBe("UNSUPPORTED_TYPE");
  });
  it("exposes the code on the error instance", async () => {
    try {
      await sniffAndValidate(svg, "LOGO", limits);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(UploadError);
      expect(e).toBeInstanceOf(Error);
      expect((e as UploadError).code).toBe("UNSUPPORTED_TYPE");
      expect((e as UploadError).name).toBe("UploadError");
    }
  });
});

describe("processImage", () => {
  it("fits a 2000×1000 PNG inside 1600 and keeps it PNG", async () => {
    const out = await processImage(png, "LOGO");
    expect(out.contentType).toBe("image/png");
    expect(out.width).toBe(1600);
    expect(out.height).toBe(800);
    const meta = await sharp(out.buffer).metadata();
    expect(meta.format).toBe("png");
    expect(meta.width).toBe(1600);
    expect(meta.height).toBe(800);
  });
  it("preserves alpha for SIGNATURE and STAMP", async () => {
    for (const kind of ["SIGNATURE", "STAMP"] as const) {
      const out = await processImage(png, kind);
      expect(out.contentType).toBe("image/png");
      const meta = await sharp(out.buffer).metadata();
      expect(meta.hasAlpha).toBe(true);
      expect(meta.channels).toBe(4);
      // The far corner was fully transparent in the source and must still be.
      const { data, info } = await sharp(out.buffer)
        .extract({ left: 1599, top: 799, width: 1, height: 1 })
        .raw()
        .toBuffer({ resolveWithObject: true });
      expect(info.channels).toBe(4);
      expect(data[3]).toBe(0);
    }
  });
  it("does not enlarge a small image", async () => {
    const small = await makePng(100, 50);
    const out = await processImage(small, "LOGO");
    expect([out.width, out.height]).toEqual([100, 50]);
  });
  it("cover-crops avatars to a 512 square PNG, enlarging small photos", async () => {
    for (const source of [png, await makePng(100, 50), jpeg]) {
      const out = await processImage(source, "AVATAR");
      expect(out.contentType).toBe("image/png");
      expect([out.width, out.height]).toEqual([512, 512]);
      const meta = await sharp(out.buffer).metadata();
      expect(meta.format).toBe("png");
      expect([meta.width, meta.height]).toEqual([512, 512]);
    }
  });
  it("applies EXIF orientation and strips metadata", async () => {
    const rotated = await makeJpeg(200, 100, 6);
    expect((await sharp(rotated).metadata()).orientation).toBe(6);
    const out = await processImage(rotated, "LOGO");
    expect([out.width, out.height]).toEqual([100, 200]);
    const meta = await sharp(out.buffer).metadata();
    expect(meta.orientation).toBeUndefined();
    expect(meta.exif).toBeUndefined();
  });
  it("re-encodes receipts as JPEG and converts WebP logos to PNG", async () => {
    const receipt = await processImage(png, "RECEIPT_IMAGE");
    expect(receipt.contentType).toBe("image/jpeg");
    expect([receipt.width, receipt.height]).toEqual([1600, 800]);
    expect((await sharp(receipt.buffer).metadata()).format).toBe("jpeg");
    const logo = await processImage(webp, "LOGO");
    expect(logo.contentType).toBe("image/png");
    expect((await sharp(logo.buffer).metadata()).format).toBe("png");
  });
  it("rejects bytes sharp cannot decode (SVG is stopped earlier, by sniffAndValidate)", async () => {
    await expect(processImage(Buffer.from("nope"), "LOGO")).rejects.toThrow();
    await expect(processImage(Buffer.alloc(0), "LOGO")).rejects.toThrow();
  });
});

describe("prepareUpload", () => {
  it("validates, re-encodes and hashes an image upload", async () => {
    const prepared = await prepareUpload(webp, "LOGO", limits);
    expect(prepared.contentType).toBe("image/png");
    expect(prepared.ext).toBe("png");
    expect([prepared.width, prepared.height]).toEqual([40, 30]);
    expect(prepared.byteSize).toBe(prepared.buffer.length);
    expect(prepared.sha256).toBe(sha256Hex(prepared.buffer));
    expect(prepared.sha256).not.toBe(sha256Hex(webp));
  });
  it("stores a receipt PDF untouched and a receipt image as JPEG", async () => {
    const asPdf = await prepareUpload(pdf, "RECEIPT", limits);
    expect(asPdf).toEqual({
      buffer: pdf,
      contentType: "application/pdf",
      ext: "pdf",
      byteSize: pdf.length,
      sha256: sha256Hex(pdf),
    });
    const asImage = await prepareUpload(jpeg, "RECEIPT", limits);
    expect(asImage.contentType).toBe("image/jpeg");
    expect(asImage.ext).toBe("jpg");
    expect([asImage.width, asImage.height]).toEqual([200, 100]);
  });
  it("propagates validation errors before touching sharp", async () => {
    expect(await code(prepareUpload(svg, "LOGO", limits))).toBe("UNSUPPORTED_TYPE");
    expect(await code(prepareUpload(pdf, "LOGO", limits))).toBe("UNSUPPORTED_TYPE");
    const big = Buffer.concat([png, Buffer.alloc(3 * MB - png.length)]);
    expect(await code(prepareUpload(big, "LOGO", limits))).toBe("TOO_LARGE");
  });
});
