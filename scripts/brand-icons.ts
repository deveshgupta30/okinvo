/**
 * Rasterises the brand mark (src/app/icon.svg) into the PNG icons the platforms want:
 * apple-icon.png (180, Next's file convention) and the manifest icons under public/icons.
 * The SVG's light default (ink ring) is rendered on the light canvas colour from DESIGN.light.md,
 * which is what a home screen expects. Also writes the social preview (opengraph-image.png and
 * twitter-image.png, 1200 x 630: the wordmark on the dark canvas) with its alt text. Every PNG
 * is palette-quantised at the highest compression level (addendum §2 items 7 and 11).
 * Run: pnpm brand:icons
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
    .png({ palette: true, compressionLevel: 9 })
    .toBuffer();
}

/** The wordmark (src/components/brand/logo.tsx) on the dark canvas, 1200 x 630. */
async function socialPreview(): Promise<Buffer> {
  const { canvas, ink } = DESIGN_COLORS.dark;
  const dot = DESIGN_COLORS.dark["brand-dot"] ?? DESIGN_COLORS.dark.primary;
  const art = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="${canvas}"/>
  <text x="600" y="330" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="190" font-weight="700" letter-spacing="-9" fill="${ink}">okinv<tspan fill="${dot}">o</tspan></text>
  <text x="600" y="430" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="40" fill="${ink}" opacity="0.72">Self-hosted invoicing</text>
</svg>`;
  return sharp(Buffer.from(art)).png({ palette: true, compressionLevel: 9 }).toBuffer();
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
const preview = await socialPreview();
const ALT = "okinvo: self-hosted invoicing for independent professionals and small businesses\n";
for (const name of ["opengraph-image", "twitter-image"]) {
  writeFileSync(resolve(root, `src/app/${name}.png`), preview);
  writeFileSync(resolve(root, `src/app/${name}.alt.txt`), ALT);
  console.log(`wrote src/app/${name}.png (1200x630, ${preview.byteLength} bytes)`);
}
