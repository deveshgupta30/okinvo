/**
 * Rasterises the brand mark (src/app/icon.svg) into the PNG icons the platforms want:
 * apple-icon.png (180, Next's file convention) and the manifest icons under public/icons.
 * The SVG's light default (ink ring) is rendered on the light canvas colour from DESIGN.light.md,
 * which is what a home screen expects. Run: pnpm brand:icons
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import sharp from "sharp";
import { DESIGN_COLORS } from "../src/lib/design-colors.generated";

const root = resolve(import.meta.dirname, "..");
const svg = readFileSync(resolve(root, "src/app/icon.svg"));

async function raster(size: number, pad: number, background: string): Promise<Buffer> {
  const inner = Math.round(size * (1 - 2 * pad));
  const mark = await sharp(svg, { density: 384 })
    .resize(inner, inner, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background } })
    .composite([{ input: mark, gravity: "centre" }])
    .png()
    .toBuffer();
}

const targets: { file: string; size: number; pad: number }[] = [
  { file: "src/app/apple-icon.png", size: 180, pad: 0.12 },
  { file: "public/icons/icon-192.png", size: 192, pad: 0.1 },
  { file: "public/icons/icon-512.png", size: 512, pad: 0.1 },
  // Maskable icons keep the mark inside the safe zone (40 % of the width is clipped away).
  { file: "public/icons/icon-512-maskable.png", size: 512, pad: 0.2 },
];

for (const t of targets) {
  const target = resolve(root, t.file);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, await raster(t.size, t.pad, DESIGN_COLORS.light.canvas));
  console.log(`wrote ${t.file} (${t.size}px)`);
}
