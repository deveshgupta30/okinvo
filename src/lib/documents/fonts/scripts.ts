/**
 * Script detection for document text (spec §9c). Every string a document prints is cut into
 * runs by script so each run can take the Noto face that carries its glyphs; the catalogue
 * families are Latin only. Punctuation, digits, spaces and symbols ("common") stay with the run
 * before them, so "राशि 1,234.00" is one Devanagari run and a mixed line never flips faces mid
 * number. Combining marks belong to their base character's run.
 */
export type Script =
  | "latin"
  | "greek"
  | "cyrillic"
  | "armenian"
  | "hebrew"
  | "arabic"
  | "syriac"
  | "devanagari"
  | "bengali"
  | "gurmukhi"
  | "gujarati"
  | "oriya"
  | "tamil"
  | "telugu"
  | "kannada"
  | "malayalam"
  | "sinhala"
  | "thai"
  | "lao"
  | "myanmar"
  | "georgian"
  | "ethiopic"
  | "khmer"
  | "han"
  | "kana"
  | "hangul"
  | "common";

/** Unicode block ranges per script; anything unlisted (ASCII punctuation, digits, symbols) is common. */
export const SCRIPT_RANGES: { script: Script; ranges: [number, number][] }[] = [
  {
    script: "latin",
    ranges: [
      [0x41, 0x5a],
      [0x61, 0x7a],
      [0xaa, 0xaa],
      [0xba, 0xba],
      [0xc0, 0xd6],
      [0xd8, 0xf6],
      [0xf8, 0x24f],
      [0x1e00, 0x1eff],
      [0x2c60, 0x2c7f],
      [0xa720, 0xa7ff],
      [0xfb00, 0xfb06],
    ],
  },
  {
    script: "greek",
    ranges: [
      [0x370, 0x3ff],
      [0x1f00, 0x1fff],
    ],
  },
  {
    script: "cyrillic",
    ranges: [
      [0x400, 0x52f],
      [0x2de0, 0x2dff],
      [0xa640, 0xa69f],
    ],
  },
  {
    script: "armenian",
    ranges: [
      [0x530, 0x58f],
      [0xfb13, 0xfb17],
    ],
  },
  {
    script: "hebrew",
    ranges: [
      [0x590, 0x5ff],
      [0xfb1d, 0xfb4f],
    ],
  },
  {
    script: "arabic",
    ranges: [
      [0x600, 0x6ff],
      [0x750, 0x77f],
      [0x8a0, 0x8ff],
      [0xfb50, 0xfdff],
      [0xfe70, 0xfeff],
    ],
  },
  {
    script: "syriac",
    ranges: [
      [0x700, 0x74f],
      [0x860, 0x86f],
    ],
  },
  {
    script: "devanagari",
    ranges: [
      [0x900, 0x97f],
      [0xa8e0, 0xa8ff],
    ],
  },
  { script: "bengali", ranges: [[0x980, 0x9ff]] },
  { script: "gurmukhi", ranges: [[0xa00, 0xa7f]] },
  { script: "gujarati", ranges: [[0xa80, 0xaff]] },
  { script: "oriya", ranges: [[0xb00, 0xb7f]] },
  { script: "tamil", ranges: [[0xb80, 0xbff]] },
  { script: "telugu", ranges: [[0xc00, 0xc7f]] },
  { script: "kannada", ranges: [[0xc80, 0xcff]] },
  { script: "malayalam", ranges: [[0xd00, 0xd7f]] },
  { script: "sinhala", ranges: [[0xd80, 0xdff]] },
  { script: "thai", ranges: [[0xe00, 0xe7f]] },
  { script: "lao", ranges: [[0xe80, 0xeff]] },
  {
    script: "myanmar",
    ranges: [
      [0x1000, 0x109f],
      [0xa9e0, 0xa9ff],
      [0xaa60, 0xaa7f],
    ],
  },
  {
    script: "georgian",
    ranges: [
      [0x10a0, 0x10ff],
      [0x1c90, 0x1cbf],
      [0x2d00, 0x2d2f],
    ],
  },
  {
    script: "ethiopic",
    ranges: [
      [0x1200, 0x139f],
      [0x2d80, 0x2ddf],
      [0xab00, 0xab2f],
    ],
  },
  {
    script: "khmer",
    ranges: [
      [0x1780, 0x17ff],
      [0x19e0, 0x19ff],
    ],
  },
  {
    script: "han",
    ranges: [
      [0x2e80, 0x2fdf],
      [0x3005, 0x3007],
      [0x3021, 0x3029],
      [0x3038, 0x303b],
      [0x3400, 0x4dbf],
      [0x4e00, 0x9fff],
      [0xf900, 0xfaff],
      [0x20000, 0x2ffff],
    ],
  },
  {
    script: "kana",
    ranges: [
      [0x3041, 0x30ff],
      [0x31f0, 0x31ff],
      [0xff66, 0xff9f],
    ],
  },
  {
    script: "hangul",
    ranges: [
      [0x1100, 0x11ff],
      [0x3130, 0x318f],
      [0xa960, 0xa97f],
      [0xac00, 0xd7ff],
    ],
  },
];

/** Combining marks: always part of the preceding run. */
const COMBINING: [number, number][] = [
  [0x300, 0x36f],
  [0x1ab0, 0x1aff],
  [0x1dc0, 0x1dff],
  [0x20d0, 0x20ff],
  [0xfe20, 0xfe2f],
  [0x200c, 0x200d], // zero-width (non-)joiner, used inside Persian and Indic words
];

const inRanges = (cp: number, ranges: [number, number][]) =>
  ranges.some(([lo, hi]) => cp >= lo && cp <= hi);

export function scriptOf(codePoint: number): Script {
  for (const { script, ranges } of SCRIPT_RANGES) if (inRanges(codePoint, ranges)) return script;
  return "common";
}

/** The Noto family per script; Latin and common text keep the template's own family. */
export const SCRIPT_FONTS: Record<Exclude<Script, "han" | "kana" | "hangul">, string | null> = {
  latin: null,
  common: null,
  greek: "Noto Sans",
  cyrillic: "Noto Sans",
  armenian: "Noto Sans Armenian",
  hebrew: "Noto Sans Hebrew",
  arabic: "Noto Sans Arabic",
  syriac: "Noto Sans Syriac",
  devanagari: "Noto Sans Devanagari",
  bengali: "Noto Sans Bengali",
  gurmukhi: "Noto Sans Gurmukhi",
  gujarati: "Noto Sans Gujarati",
  oriya: "Noto Sans Oriya",
  tamil: "Noto Sans Tamil",
  telugu: "Noto Sans Telugu",
  kannada: "Noto Sans Kannada",
  malayalam: "Noto Sans Malayalam",
  sinhala: "Noto Sans Sinhala",
  thai: "Noto Sans Thai",
  lao: "Noto Sans Lao",
  myanmar: "Noto Sans Myanmar",
  georgian: "Noto Sans Georgian",
  ethiopic: "Noto Sans Ethiopic",
  khmer: "Noto Sans Khmer",
};

export const CJK_FAMILIES = [
  "Noto Sans SC",
  "Noto Sans TC",
  "Noto Sans JP",
  "Noto Sans KR",
] as const;
export type CjkFamily = (typeof CJK_FAMILIES)[number];

/** Han, kana and hangul share code points across languages: the document language picks the face. */
export function cjkFamily(locale: string): CjkFamily {
  const tag = locale.toLowerCase();
  if (tag.startsWith("ja")) return "Noto Sans JP";
  if (tag.startsWith("ko")) return "Noto Sans KR";
  if (tag === "zh-tw" || tag === "zh-hk" || tag === "zh-hant") return "Noto Sans TC";
  return "Noto Sans SC";
}

/** Every Noto family a document may switch to, for registration and the preview's fallback stack. */
export const SCRIPT_FAMILIES: string[] = [
  ...new Set(Object.values(SCRIPT_FONTS).filter((f): f is string => f !== null)),
  ...CJK_FAMILIES,
];

export interface TextRun {
  text: string;
  fontFamily: string;
}

function familyFor(script: Script, base: string, locale: string): string {
  if (script === "han" || script === "kana") return cjkFamily(locale);
  if (script === "hangul") return "Noto Sans KR";
  return SCRIPT_FONTS[script] ?? base;
}

/**
 * Splits `text` into runs of one font family each. Common characters and combining marks
 * extend the current run; a line that opens with common characters starts in the base family.
 */
export function splitRuns(text: string, base: string, locale: string): TextRun[] {
  const runs: TextRun[] = [];
  let current: TextRun | null = null;
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;
    const script = inRanges(cp, COMBINING) ? "common" : scriptOf(cp);
    const family: string =
      script === "common" ? (current?.fontFamily ?? base) : familyFor(script, base, locale);
    if (current && current.fontFamily === family) current.text += ch;
    else {
      current = { text: ch, fontFamily: family };
      runs.push(current);
    }
  }
  return runs;
}
