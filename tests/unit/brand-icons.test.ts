import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The brand PNGs are generated offline by scripts/brand-icons.ts (addendum §2 items 7 and 11):
 * the social preview is 1200 x 630 with an alt text beside it, and every file stays small
 * because it is written palette-quantised at the highest compression level.
 */
const ROOT = path.resolve(import.meta.dirname, "..", "..");

/** Width and height from a PNG's IHDR chunk. */
function pngSize(file: string): { width: number; height: number } {
  const buf = readFileSync(file);
  expect(buf.subarray(1, 4).toString("ascii")).toBe("PNG");
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

describe("brand images", () => {
  it.each([
    ["src/app/opengraph-image.png", 1200, 630, 150],
    ["src/app/twitter-image.png", 1200, 630, 150],
    ["src/app/apple-icon.png", 180, 180, 20],
    ["public/icons/icon-192.png", 192, 192, 20],
    ["public/icons/icon-512.png", 512, 512, 60],
    ["public/icons/icon-512-maskable.png", 512, 512, 60],
  ])("%s is %dx%d and at most %d KB", (file, width, height, maxKb) => {
    const full = path.join(ROOT, file);
    expect(pngSize(full)).toEqual({ width, height });
    expect(statSync(full).size).toBeLessThanOrEqual(maxKb * 1024);
  });

  it("gives the social previews an alt text", () => {
    for (const f of ["src/app/opengraph-image.alt.txt", "src/app/twitter-image.alt.txt"]) {
      expect(readFileSync(path.join(ROOT, f), "utf8").trim().length).toBeGreaterThan(10);
    }
  });
});
