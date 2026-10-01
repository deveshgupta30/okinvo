import { addDays, isDateString, type DateString } from "@/lib/dates";

/**
 * Fiscal-year labels (SPEC.md §4.2, §4.6 "Numbering"). A year starting in month 1 is labelled by
 * the calendar year ("2026"); any other start month spans two calendar years and is labelled
 * "YYYY-YY" ("2026-27" for 2026-04-01..2027-03-31). Pure string arithmetic on `YYYY-MM-DD`
 * dates — never a `Date` from a bare date string. Browser-safe.
 */

const FY_LABEL_RE = /^(\d{4})(?:-(\d{2}))?$/;

const pad2 = (n: number): string => String(n).padStart(2, "0");

function assertStartMonth(startMonth: number): void {
  if (!Number.isInteger(startMonth) || startMonth < 1 || startMonth > 12) {
    throw new RangeError(`Fiscal-year start month must be an integer 1–12, got ${startMonth}`);
  }
}

function assertDate(date: string): void {
  if (!isDateString(date)) throw new RangeError(`Not a calendar date: ${date}`);
}

function parseLabel(fy: string): { startYear: number; twoPart: boolean } {
  const m = FY_LABEL_RE.exec(fy);
  if (!m || m[1] === undefined) throw new RangeError(`Not a fiscal-year label: ${fy}`);
  return { startYear: Number(m[1]), twoPart: m[2] !== undefined };
}

function label(startYear: number, startMonth: number): string {
  return startMonth === 1 ? String(startYear) : `${startYear}-${pad2((startYear + 1) % 100)}`;
}

/** Calendar year in which the fiscal year containing `date` starts. */
function startYearOf(date: DateString, startMonth: number): number {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  return month >= startMonth ? year : year - 1;
}

/** "2026" when startMonth is 1; otherwise "2026-27" for 2026-04-01..2027-03-31 (startMonth 4). */
export function fiscalYearOf(date: DateString, startMonth: number): string {
  assertDate(date);
  assertStartMonth(startMonth);
  return label(startYearOf(date, startMonth), startMonth);
}

/** "2026-27" → "26-27"; "2026" → "26". The `{FY}` token. */
export function fiscalYearShort(fy: string): string {
  const m = FY_LABEL_RE.exec(fy);
  if (!m || m[1] === undefined) throw new RangeError(`Not a fiscal-year label: ${fy}`);
  const yy = m[1].slice(2);
  return m[2] === undefined ? yy : `${yy}-${m[2]}`;
}

/** First and last calendar dates of a fiscal year. Throws when the label and start month disagree. */
export function fiscalYearRange(
  fy: string,
  startMonth: number,
): { from: DateString; to: DateString } {
  assertStartMonth(startMonth);
  const { startYear } = parseLabel(fy);
  const from = `${startYear}-${pad2(startMonth)}-01`;
  assertDate(from);
  if (fiscalYearOf(from, startMonth) !== fy) {
    throw new RangeError(`Fiscal year ${fy} does not match a start month of ${startMonth}`);
  }
  const to = addDays(`${startYear + 1}-${pad2(startMonth)}-01`, -1);
  return { from, to };
}

/** Every fiscal year touched by the inclusive date range, ascending; empty when from > to. */
export function fiscalYearsBetween(from: DateString, to: DateString, startMonth: number): string[] {
  assertDate(from);
  assertDate(to);
  assertStartMonth(startMonth);
  if (from > to) return [];
  const first = startYearOf(from, startMonth);
  const last = startYearOf(to, startMonth);
  const out: string[] = [];
  for (let year = first; year <= last; year++) out.push(label(year, startMonth));
  return out;
}
