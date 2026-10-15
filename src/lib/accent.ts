/**
 * Selectable pastel accent (spec §3.4). The values live in DESIGN.md / DESIGN.light.md as
 * `accent-<id>-*` colours and reach the page as `:root[data-accent="<id>"]` token overrides;
 * this module only knows the ids, their labels and the cookie that mirrors `User.accent`.
 */
export const ACCENTS = [
  "mint",
  "lavender",
  "sky",
  "peach",
  "butter",
  "rose",
  "sage",
  "lilac",
] as const;
export type AccentId = (typeof ACCENTS)[number];

/** Mint is the green of the brand mark's dot. */
export const DEFAULT_ACCENT: AccentId = "mint";
export const ACCENT_COOKIE = "okinvo.accent";

export const ACCENT_LABELS: Record<AccentId, string> = {
  mint: "Mint",
  lavender: "Lavender",
  sky: "Sky",
  peach: "Peach",
  butter: "Butter",
  rose: "Rose",
  sage: "Sage",
  lilac: "Lilac",
};

export function isAccent(v: unknown): v is AccentId {
  return typeof v === "string" && (ACCENTS as readonly string[]).includes(v);
}

/** Anything that is not a known id or a valid custom value is the default, so a stale or garbage cookie never breaks a page. */
export function parseAccent(v: unknown): Accent {
  return parseAccentValue(v);
}

/**
 * A custom accent (addendum §3): `custom-<rrggbb>` in the cookie and in `User.accent`, applied
 * as `data-accent="custom"` plus the four `--accent-custom-*` variables on <html> that the
 * `:root[data-accent="custom"]` block in globals.css maps onto the primary tokens.
 */
export type CustomAccent = `custom-${string}`;
export type Accent = AccentId | CustomAccent;

const CUSTOM_RE = /^custom-([0-9a-f]{6})$/;
const HEX_RE = /^#?([0-9a-fA-F]{6})$/;

export function isCustomAccent(v: unknown): v is CustomAccent {
  return typeof v === "string" && CUSTOM_RE.test(v);
}

/** `#AA3366` or `aa3366` to its accent value; anything else is null. */
export function customAccent(hex: string): CustomAccent | null {
  const m = HEX_RE.exec(hex.trim());
  return m ? `custom-${m[1]!.toLowerCase()}` : null;
}

/** Anything that is neither a known id nor a valid custom value is the default (see parseAccent). */
export function parseAccentValue(v: unknown): Accent {
  if (isAccent(v)) return v;
  if (isCustomAccent(v)) return v;
  return DEFAULT_ACCENT;
}

/** The `data-accent` attribute value: the id, or "custom" for a custom hex. */
export function accentAttribute(accent: Accent): string {
  return isCustomAccent(accent) ? "custom" : accent;
}

/** The hex of a custom accent, null for a preset (presets come from DESIGN.md through tokens.css). */
export function accentHex(accent: Accent): string | null {
  const m = CUSTOM_RE.exec(accent);
  return m ? `#${m[1]}` : null;
}

function channel(hex: string, i: number): number {
  return Number.parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
}

function toHex(r: number, g: number, b: number): string {
  return (
    "#" +
    [r, g, b]
      .map((c) =>
        Math.max(0, Math.min(255, Math.round(c)))
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}

/** WCAG relative luminance of a `#rrggbb` colour. */
function luminance(hex: string): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return (
    0.2126 * lin(channel(hex, 0)) + 0.7152 * lin(channel(hex, 1)) + 0.0722 * lin(channel(hex, 2))
  );
}

/** Dark ink (the DESIGN.md on-primary of every pastel) on light accents, white on dark ones. */
const INK_ON_LIGHT = "#17191e";
const INK_ON_DARK = "#ffffff";

export type CustomAccentVars = {
  "--accent-custom-primary": string;
  "--accent-custom-on-primary": string;
  "--accent-custom-primary-hover": string;
  /** Focus ring on the dark canvas (3:1 or better, like the preset focus shades). */
  "--accent-custom-primary-focus": string;
  /** Focus ring on the light canvas. */
  "--accent-custom-primary-focus-light": string;
};

/** WCAG contrast ratio between two `#rrggbb` colours. */
function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** The colour pulled `amount` (0..1) towards white (255) or black (0). */
function pulled(hex: string, towards: 0 | 255, amount: number): string {
  const mix = (i: number) => channel(hex, i) + (towards - channel(hex, i)) * amount;
  return toHex(mix(0), mix(1), mix(2));
}

/** The nearest shade of `hex` (pulled towards `towards`) that reads at 3:1 on `canvas`. */
function focusShade(hex: string, canvas: string, towards: 0 | 255): string {
  for (let step = 0; step <= 20; step += 1) {
    const candidate = pulled(hex, towards, step / 20);
    if (contrastRatio(candidate, canvas) >= 3) return candidate;
  }
  return towards === 255 ? "#ffffff" : "#000000";
}

const CANVAS_DARK = "#010102";
const CANVAS_LIGHT = "#ffffff";

/**
 * The primary tokens for a custom accent, derived the way DESIGN.md derives them for the
 * pastels: the ink with the higher contrast sits on it (not a fixed luminance cut, which picked
 * white on mid blues and greys at 3:1 where dark ink reads at 6:1), hover is the colour pulled
 * 6% towards that ink, and the focus ring is the nearest shade that reads at 3:1 on each
 * theme's canvas, as the eight presets were tuned.
 */
export function customAccentVars(accent: CustomAccent): CustomAccentVars {
  const hex = accentHex(accent) ?? "#000000";
  const dark = contrastRatio(hex, INK_ON_DARK) > contrastRatio(hex, INK_ON_LIGHT);
  return {
    "--accent-custom-primary": hex,
    "--accent-custom-on-primary": dark ? INK_ON_DARK : INK_ON_LIGHT,
    "--accent-custom-primary-hover": pulled(hex, dark ? 255 : 0, 0.06),
    "--accent-custom-primary-focus": focusShade(hex, CANVAS_DARK, 255),
    "--accent-custom-primary-focus-light": focusShade(hex, CANVAS_LIGHT, 0),
  };
}

/** Inline style for <html> (server) or `setProperty` pairs (client); empty for a preset. */
export function accentStyle(accent: Accent): Partial<CustomAccentVars> {
  return isCustomAccent(accent) ? customAccentVars(accent) : {};
}

/** The four custom-accent variable names, cleared when a preset is chosen again. */
export const CUSTOM_ACCENT_VARS = [
  "--accent-custom-primary",
  "--accent-custom-on-primary",
  "--accent-custom-primary-hover",
  "--accent-custom-primary-focus",
  "--accent-custom-primary-focus-light",
] as const;

/**
 * Applies an accent to the document immediately (attribute, inline variables, cookie) so there
 * is no flash before the server action lands. Browser only.
 */
export function applyAccentToDocument(accent: Accent): void {
  const root = document.documentElement;
  root.setAttribute("data-accent", accentAttribute(accent));
  const vars = accentStyle(accent);
  for (const name of CUSTOM_ACCENT_VARS) {
    const v = vars[name];
    if (v) root.style.setProperty(name, v);
    else root.style.removeProperty(name);
  }
  document.cookie = `${ACCENT_COOKIE}=${accent}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
}
