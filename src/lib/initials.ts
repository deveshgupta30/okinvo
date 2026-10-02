const segmenter =
  typeof Intl !== "undefined" && "Segmenter" in Intl
    ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
    : null;

function firstGrapheme(word: string): string {
  if (segmenter) {
    for (const seg of segmenter.segment(word)) return seg.segment;
    return "";
  }
  return Array.from(word)[0] ?? "";
}

/**
 * Up to two initials for the avatar fallback (spec §3.5): the first letter of the first two
 * words — "Allison Murray Roy" → "AM" — grapheme-safe for scripts with combining marks. An empty
 * name falls back to the first letter of `fallback` (the e-mail).
 */
export function initialsOf(name: string, fallback = ""): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    const f = firstGrapheme(fallback.trim());
    return f.toLocaleUpperCase();
  }
  return words
    .slice(0, 2)
    .map((w) => firstGrapheme(w).toLocaleUpperCase())
    .join("");
}
