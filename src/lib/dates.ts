import { z } from "zod";

/**
 * Calendar dates are `YYYY-MM-DD` strings everywhere in okinvo (CLAUDE.md "Dates"); instants are
 * UTC Dates. The Prisma `@db.Date` columns are converted at the DAL boundary with
 * toDateString/fromDateString, never by constructing a Date from a bare date string.
 */
export type DateString = string;

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isDateString(s: string): boolean {
  const m = DATE_RE.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

export const DateStringSchema: z.ZodType<DateString> = z
  .string()
  .refine(isDateString, { message: "must be a calendar date in YYYY-MM-DD form" });

const pad = (n: number) => String(n).padStart(2, "0");

/** UTC calendar parts of an instant. */
export function toDateString(d: Date): DateString {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** UTC midnight of a calendar date - the representation Postgres `date` columns round-trip. */
export function fromDateString(s: DateString): Date {
  if (!isDateString(s)) throw new RangeError(`Not a calendar date: ${s}`);
  return new Date(`${s}T00:00:00.000Z`);
}

export function isValidTimeZone(tz: string): boolean {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** "Today" for a person in `timeZone` - the only way to obtain a current date in the app. */
export function todayIn(timeZone: string, now: Date = new Date()): DateString {
  const zone = isValidTimeZone(timeZone) ? timeZone : "UTC";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function addDays(s: DateString, days: number): DateString {
  const d = fromDateString(s);
  d.setUTCDate(d.getUTCDate() + days);
  return toDateString(d);
}

export function compareDates(a: DateString, b: DateString): -1 | 0 | 1 {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function nowIso(): string {
  return new Date().toISOString();
}
