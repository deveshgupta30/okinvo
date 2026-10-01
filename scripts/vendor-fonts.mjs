// Copies the WOFF faces the PDF renderer embeds into public/fonts (served statically for the HTML
// preview and present in the standalone image). Run after bumping an @fontsource package.
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const OUT = path.resolve("public/fonts");
mkdirSync(OUT, { recursive: true });

const FACES = [
  // latin-ext carries the currency symbols (₹ U+20B9) the latin subsets lack; registered as "Symbols".
  [
    "@fontsource/inter",
    [
      "inter-latin-400-normal",
      "inter-latin-500-normal",
      "inter-latin-600-normal",
      "inter-latin-ext-400-normal",
    ],
  ],
  [
    "@fontsource/ibm-plex-sans",
    [
      "ibm-plex-sans-latin-400-normal",
      "ibm-plex-sans-latin-500-normal",
      "ibm-plex-sans-latin-600-normal",
    ],
  ],
  [
    "@fontsource/source-serif-4",
    ["source-serif-4-latin-400-normal", "source-serif-4-latin-600-normal"],
  ],
  ["@fontsource/noto-sans", ["noto-sans-latin-400-normal"]],
];

for (const [pkg, files] of FACES) {
  const dir = path.join(path.dirname(require.resolve(`${pkg}/package.json`)), "files");
  for (const f of files) copyFileSync(path.join(dir, `${f}.woff`), path.join(OUT, `${f}.woff`));
}
console.log(`vendored ${FACES.reduce((n, [, f]) => n + f.length, 0)} faces into public/fonts`);
