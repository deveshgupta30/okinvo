/**
 * Formula-injection guard for CSV/XLSX text cells (SPEC.md §4.11, v2 §13.3). A spreadsheet treats
 * a cell starting with one of these characters as a formula (the OWASP CSV-injection list), so the
 * writers pass every text cell through `guardCell`. Numbers are the writer's job: this guard is
 * for text only, so "-5" as text is prefixed and a numeric cell is written as a number.
 */
export const RISKY = /^[=+\-@\t\r]/;

/**
 * Prefix `'` when the text would be read as a formula; also drop NUL bytes, which some importers
 * skip silently (so "\u0000=1+1" would otherwise slip past the check). Anything else is returned
 * unchanged, including the empty string.
 */
export function guardCell(s: string): string {
  const clean = s.includes("\u0000") ? s.replaceAll("\u0000", "") : s;
  // Spreadsheets trim leading whitespace and line breaks and fold full-width punctuation (NFKC)
  // before deciding whether a cell is a formula: judge the cell the way they will, as well as raw.
  const probe = clean.replace(/^[\s\uFEFF]+/, "").normalize("NFKC");
  return RISKY.test(clean) || RISKY.test(probe) ? `'${clean}` : clean;
}
