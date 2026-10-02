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

/** Anything that is not a known id is the default, so a stale or garbage cookie never breaks a page. */
export function parseAccent(v: unknown): AccentId {
  return isAccent(v) ? v : DEFAULT_ACCENT;
}
