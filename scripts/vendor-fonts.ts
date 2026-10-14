/**
 * Vendors the document fonts (src/lib/documents/fonts/catalog.ts) from their Fontsource packages
 * into public/fonts/<id>/, and writes the two generated files both renderers read:
 *   - src/lib/documents/fonts/registry.generated.ts  (one entry per shipped face, for react-pdf)
 *   - src/app/document-fonts.css                     (@font-face rules, for the HTML preview)
 *
 *   pnpm fonts:vendor            copy faces and rewrite the generated files
 *   pnpm fonts:vendor --check    exit 1 when anything on disk differs from the catalogue (CI)
 *
 * The catalogue families ship their latin subset only. Script coverage (spec §9c) comes from the
 * Noto families: one Fontsource package per script (400 and 700 of the script's own subset), and
 * the four CJK variable TTFs fetched from google/fonts at a pinned commit (the Fontsource CJK
 * packages are sliced by unicode range, which the PDF renderer cannot use). The currency symbols
 * (₹ U+20B9 and friends) live in Inter's latin-ext subset, registered separately as "Symbols".
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { format, resolveConfig } from "prettier";
import { FONT_CATALOG } from "../src/lib/documents/fonts/catalog";
import { CJK_FAMILIES, SCRIPT_FONTS } from "../src/lib/documents/fonts/scripts";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, "public", "fonts");
const REGISTRY = path.join(ROOT, "src", "lib", "documents", "fonts", "registry.generated.ts");
const CSS = path.join(ROOT, "src", "app", "document-fonts.css");
const check = process.argv.includes("--check");

interface Face {
  weight: number;
  style: "normal" | "italic";
  file: string;
}

const SYMBOL_FACE = {
  package: "@fontsource/inter",
  name: "inter-latin-ext-400-normal",
  file: "inter/inter-latin-ext-400-normal.woff",
};

/** Script family → Fontsource package and the subsets whose 400/700 faces ship. */
const SCRIPT_PACKAGES: Record<string, { package: string; subsets: string[] }> = {
  "Noto Sans": {
    package: "@fontsource/noto-sans",
    subsets: ["greek", "greek-ext", "cyrillic", "cyrillic-ext"],
  },
  "Noto Sans Armenian": { package: "@fontsource/noto-sans-armenian", subsets: ["armenian"] },
  "Noto Sans Hebrew": { package: "@fontsource/noto-sans-hebrew", subsets: ["hebrew"] },
  "Noto Sans Arabic": { package: "@fontsource/noto-sans-arabic", subsets: ["arabic"] },
  "Noto Sans Syriac": { package: "@fontsource/noto-sans-syriac", subsets: ["syriac"] },
  "Noto Sans Devanagari": { package: "@fontsource/noto-sans-devanagari", subsets: ["devanagari"] },
  "Noto Sans Bengali": { package: "@fontsource/noto-sans-bengali", subsets: ["bengali"] },
  "Noto Sans Gurmukhi": { package: "@fontsource/noto-sans-gurmukhi", subsets: ["gurmukhi"] },
  "Noto Sans Gujarati": { package: "@fontsource/noto-sans-gujarati", subsets: ["gujarati"] },
  "Noto Sans Oriya": { package: "@fontsource/noto-sans-oriya", subsets: ["oriya"] },
  "Noto Sans Tamil": { package: "@fontsource/noto-sans-tamil", subsets: ["tamil"] },
  "Noto Sans Telugu": { package: "@fontsource/noto-sans-telugu", subsets: ["telugu"] },
  "Noto Sans Kannada": { package: "@fontsource/noto-sans-kannada", subsets: ["kannada"] },
  "Noto Sans Malayalam": { package: "@fontsource/noto-sans-malayalam", subsets: ["malayalam"] },
  "Noto Sans Sinhala": { package: "@fontsource/noto-sans-sinhala", subsets: ["sinhala"] },
  "Noto Sans Thai": { package: "@fontsource/noto-sans-thai", subsets: ["thai"] },
  "Noto Sans Lao": { package: "@fontsource/noto-sans-lao", subsets: ["lao"] },
  "Noto Sans Myanmar": { package: "@fontsource/noto-sans-myanmar", subsets: ["myanmar"] },
  "Noto Sans Georgian": { package: "@fontsource/noto-sans-georgian", subsets: ["georgian"] },
  "Noto Sans Ethiopic": { package: "@fontsource/noto-sans-ethiopic", subsets: ["ethiopic"] },
  "Noto Sans Khmer": { package: "@fontsource/noto-sans-khmer", subsets: ["khmer"] },
};

/** google/fonts commit the CJK variable fonts are pinned to, with their sha256. */
const CJK_COMMIT = "4a943f60f1e99b2e5a2778aa34ba82adf77e4615";
const CJK_FILES: Record<
  (typeof CJK_FAMILIES)[number],
  { dir: string; name: string; sha256: string }
> = {
  "Noto Sans SC": {
    dir: "notosanssc",
    name: "NotoSansSC[wght].ttf",
    sha256: "a3041811a78c361b1de50f953c805e0244951c21c5bd412f7232ef0d899af0da",
  },
  "Noto Sans TC": {
    dir: "notosanstc",
    name: "NotoSansTC[wght].ttf",
    sha256: "864727d210d54f2537bbe23b3a839436c3992af72de9322af5270897246bd44f",
  },
  "Noto Sans JP": {
    dir: "notosansjp",
    name: "NotoSansJP[wght].ttf",
    sha256: "c2f3b4d463500a2ddcd3849cded1fceeb9fd6d1c32e6cbecd568453ba50fc68f",
  },
  "Noto Sans KR": {
    dir: "notosanskr",
    name: "NotoSansKR[wght].ttf",
    sha256: "194018e6b2b293a7964f037b25c0249ce1418bc9ab3c971060a03aa57861e252",
  },
};

interface ScriptFace extends Face {
  /** CSS unicode-range of the subset, from the package's index.css. */
  unicodeRange: string;
}

/** The unicode-range Fontsource declares for `<pkg>/files/<name>.woff`. */
function unicodeRangeOf(pkg: string, name: string): string {
  const css = readFileSync(
    path.join(path.dirname(require.resolve(`${pkg}/package.json`)), "index.css"),
    "utf8",
  );
  const block = css.split("@font-face").find((b) => b.includes(`${name}.woff`));
  const m = block?.match(/unicode-range:\s*([^;]+);/);
  if (!m?.[1]) throw new Error(`${pkg}: no unicode-range for ${name}`);
  // the same spacing Prettier keeps, so the generated CSS stays formatted
  return m[1].trim().replace(/,\s*/g, ", ");
}

function packageFiles(pkg: string): string {
  return path.join(path.dirname(require.resolve(`${pkg}/package.json`)), "files");
}

function sha(file: string): string {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

/** Every face the catalogue asks for, resolved to a source path; throws when a package lacks one. */
function plan(): { faces: Record<string, Face[]>; copies: { from: string; to: string }[] } {
  const faces: Record<string, Face[]> = {};
  const copies: { from: string; to: string }[] = [];
  for (const f of FONT_CATALOG) {
    const dir = packageFiles(f.package);
    const list: Face[] = [];
    const want: { weight: number; style: Face["style"] }[] = f.weights.map((weight) => ({
      weight,
      style: "normal",
    }));
    if (f.italic) want.push({ weight: 400, style: "italic" });
    for (const { weight, style } of want) {
      const name = `${f.id}-latin-${weight}-${style}.woff`;
      const from = path.join(dir, name);
      if (!existsSync(from))
        throw new Error(`${f.package} ships no ${name}; fix the catalogue entry`);
      const file = `${f.id}/${name}`;
      list.push({ weight, style, file });
      copies.push({ from, to: path.join(OUT, file) });
    }
    faces[f.id] = list;
  }
  copies.push({
    from: path.join(packageFiles(SYMBOL_FACE.package), `${SYMBOL_FACE.name}.woff`),
    to: path.join(OUT, SYMBOL_FACE.file),
  });
  return { faces, copies };
}

/** The script faces (spec §9c): 400 and 700 of each script subset, one directory per family. */
function planScripts(): {
  faces: Record<string, ScriptFace[]>;
  copies: { from: string; to: string }[];
} {
  const faces: Record<string, ScriptFace[]> = {};
  const copies: { from: string; to: string }[] = [];
  const wanted = new Set(Object.values(SCRIPT_FONTS).filter((f): f is string => f !== null));
  for (const [family, spec] of Object.entries(SCRIPT_PACKAGES)) {
    if (!wanted.has(family)) throw new Error(`${family} is vendored but no script maps to it`);
    const id = spec.package.replace("@fontsource/", "");
    const dir = packageFiles(spec.package);
    const list: ScriptFace[] = [];
    for (const subset of spec.subsets) {
      for (const weight of [400, 700]) {
        const name = `${id}-${subset}-${weight}-normal`;
        const from = path.join(dir, `${name}.woff`);
        if (!existsSync(from)) throw new Error(`${spec.package} ships no ${name}.woff`);
        const file = `${id}/${name}.woff`;
        // the subset range is the same at every weight; index.css declares it for the 400 face
        const range = unicodeRangeOf(spec.package, `${id}-${subset}-400-normal`);
        list.push({ weight, style: "normal", file, unicodeRange: range });
        copies.push({ from, to: path.join(OUT, file) });
      }
    }
    faces[family] = list;
  }
  for (const family of wanted) if (!faces[family]) throw new Error(`no package for ${family}`);
  return { faces, copies };
}

const cjkPath = (name: string) => path.join(OUT, "cjk", name);
const cjkUrl = (dir: string, name: string) =>
  `https://raw.githubusercontent.com/google/fonts/${CJK_COMMIT}/ofl/${dir}/${encodeURIComponent(name)}`;

/** Fetches a CJK font that is missing or does not match its pin; keeps a matching file as is. */
async function ensureCjk(): Promise<string[]> {
  const problems: string[] = [];
  for (const [family, f] of Object.entries(CJK_FILES)) {
    const to = cjkPath(f.name);
    const present = existsSync(to);
    if (present && sha(to) === f.sha256) continue;
    if (check) {
      problems.push(present ? `cjk/${f.name} does not match its pin` : `missing cjk/${f.name}`);
      continue;
    }
    try {
      const res = await fetch(cjkUrl(f.dir, f.name));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const bytes = Buffer.from(await res.arrayBuffer());
      const got = createHash("sha256").update(bytes).digest("hex");
      if (got !== f.sha256) throw new Error(`sha256 ${got} does not match the pin for ${family}`);
      mkdirSync(path.dirname(to), { recursive: true });
      writeFileSync(to, bytes);
      console.log(`fetched ${family} (${(bytes.length / 1e6).toFixed(1)} MB)`);
    } catch (e) {
      if (present)
        console.warn(
          `warning: could not refresh cjk/${f.name} (${(e as Error).message}); keeping the file on disk`,
        );
      else throw new Error(`cannot fetch ${family}: ${(e as Error).message}`);
    }
  }
  return problems;
}

function registrySource(
  faces: Record<string, Face[]>,
  scriptFaces: Record<string, ScriptFace[]>,
): string {
  const lines = Object.entries(faces).map(
    ([id, list]) =>
      `  ${/^[a-z][a-z0-9]*$/.test(id) ? id : JSON.stringify(id)}: [\n${list
        .map(
          (x) => `    {
      weight: ${x.weight},
      style: "${x.style}",
      file: "${x.file}",
    },`,
        )
        .join("\n")}\n  ],`,
  );
  return `// Generated by scripts/vendor-fonts.ts — do not edit. Run \`pnpm fonts:vendor\`.
import type { FontId } from "./catalog";

export interface FontFace {
  weight: number;
  style: "normal" | "italic";
  /** Path under public/fonts. */
  file: string;
}

/** The face that carries ₹ and other currency symbols (Inter latin-ext), registered as "Symbols". */
export const SYMBOL_FILE = "${SYMBOL_FACE.file}";

export const FONT_FILES: Record<FontId, FontFace[]> = {
${lines.join("\n")}
};

/** The Noto script families (spec §9c), one entry per shipped subset face, keyed by family name. */
export const SCRIPT_FONT_FILES: Record<string, FontFace[]> = {
${Object.entries(scriptFaces)
  .map(
    ([family, list]) =>
      `  ${JSON.stringify(family)}: [\n${list
        .map((x) => `    { weight: ${x.weight}, style: "${x.style}", file: "${x.file}" },`)
        .join("\n")}\n  ],`,
  )
  .join("\n")}
};

/** The CJK variable fonts (google/fonts @ ${CJK_COMMIT}), registered at weight 400. */
export const CJK_FONT_FILES: Record<string, { file: string; sha256: string }> = {
${Object.entries(CJK_FILES)
  .map(
    ([family, f]) =>
      `  ${JSON.stringify(family)}: { file: "cjk/${f.name}", sha256: "${f.sha256}" },`,
  )
  .join("\n")}
};
`;
}

function cssSource(
  faces: Record<string, Face[]>,
  scriptFaces: Record<string, ScriptFace[]>,
): string {
  const rules: string[] = [
    "/* Generated by scripts/vendor-fonts.ts — do not edit. Faces the document preview shares with the PDF renderer. */",
  ];
  for (const f of FONT_CATALOG) {
    for (const x of faces[f.id] ?? []) {
      rules.push(
        `@font-face {\n  font-family: ${JSON.stringify(f.family)};\n  font-weight: ${x.weight};\n  font-style: ${x.style};\n  font-display: swap;\n  src: url("/fonts/${x.file}") format("woff");\n}`,
      );
    }
  }
  rules.push(
    `@font-face {\n  font-family: "Symbols";\n  font-weight: 400;\n  src: url("/fonts/${SYMBOL_FACE.file}") format("woff");\n}`,
  );
  for (const [family, list] of Object.entries(scriptFaces)) {
    for (const x of list) {
      rules.push(
        `@font-face {\n  font-family: ${JSON.stringify(family)};\n  font-weight: ${x.weight};\n  font-style: normal;\n  font-display: swap;\n  src: url("/fonts/${x.file}") format("woff");\n  unicode-range: ${x.unicodeRange};\n}`,
      );
    }
  }
  // The CJK files are whole fonts of 10 to 18 MB: the range keeps a browser from fetching one
  // for a stray glyph in a Latin document.
  const cjkRange =
    "U+2E80-2FDF, U+3000-30FF, U+3100-312F, U+3130-318F, U+31A0-31FF, U+3400-4DBF, U+4E00-9FFF, U+A960-A97F, U+AC00-D7FF, U+F900-FAFF, U+FF00-FFEF, U+20000-2FFFF";
  for (const [family, f] of Object.entries(CJK_FILES)) {
    rules.push(
      `@font-face {\n  font-family: ${JSON.stringify(family)};\n  font-weight: 100 900;\n  font-style: normal;\n  font-display: swap;\n  src: url("/fonts/cjk/${f.name}") format("truetype");\n  unicode-range: ${cjkRange};\n}`,
    );
  }
  return rules.join("\n") + "\n";
}

const { faces, copies: catalogueCopies } = plan();
const { faces: scriptFaces, copies: scriptCopies } = planScripts();
const copies = [...catalogueCopies, ...scriptCopies];
// the registry is TypeScript the repo lints, so it leaves here already in the repo's style
const registry = await format(registrySource(faces, scriptFaces), {
  ...(await resolveConfig(REGISTRY)),
  filepath: REGISTRY,
});
const css = cssSource(faces, scriptFaces);
const wanted = new Set([
  ...copies.map((c) => path.relative(OUT, c.to).replaceAll("\\", "/")),
  ...Object.values(CJK_FILES).map((f) => `cjk/${f.name}`),
]);

function onDisk(): string[] {
  if (!existsSync(OUT)) return [];
  const out: string[] = [];
  for (const dir of readdirSync(OUT, { withFileTypes: true })) {
    if (dir.isFile()) out.push(dir.name);
    else for (const f of readdirSync(path.join(OUT, dir.name))) out.push(`${dir.name}/${f}`);
  }
  return out;
}

if (check) {
  const problems: string[] = await ensureCjk();
  for (const c of copies) {
    if (!existsSync(c.to)) problems.push(`missing ${path.relative(ROOT, c.to)}`);
    else if (sha(c.from) !== sha(c.to)) problems.push(`stale ${path.relative(ROOT, c.to)}`);
  }
  for (const f of onDisk()) if (!wanted.has(f)) problems.push(`unexpected public/fonts/${f}`);
  if (!existsSync(REGISTRY) || readFileSync(REGISTRY, "utf8") !== registry)
    problems.push("registry.generated.ts is out of date");
  if (!existsSync(CSS) || readFileSync(CSS, "utf8") !== css)
    problems.push("document-fonts.css is out of date");
  if (problems.length) {
    console.error(
      `fonts:vendor --check failed:\n  ${problems.slice(0, 20).join("\n  ")}${problems.length > 20 ? `\n  …and ${problems.length - 20} more` : ""}`,
    );
    process.exit(1);
  }
  console.log(
    `fonts:vendor --check ok - ${copies.length} faces, ${FONT_CATALOG.length} families, ${Object.keys(scriptFaces).length} script families, ${CJK_FAMILIES.length} CJK fonts`,
  );
} else {
  await ensureCjk();
  for (const f of onDisk()) if (!wanted.has(f)) rmSync(path.join(OUT, f));
  for (const c of copies) {
    mkdirSync(path.dirname(c.to), { recursive: true });
    writeFileSync(c.to, readFileSync(c.from));
  }
  writeFileSync(REGISTRY, registry);
  writeFileSync(CSS, css);
  console.log(
    `vendored ${copies.length} faces for ${FONT_CATALOG.length} families and ${Object.keys(scriptFaces).length} script families into public/fonts`,
  );
}
