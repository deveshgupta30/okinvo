import { fromDateString, type DateString } from "@/lib/dates";
import { normaliseIntlSpaces } from "./money";

/**
 * Locale-aware date formatting (SPEC.md §4.10). Calendar dates are `YYYY-MM-DD` strings and are
 * rendered in UTC so the printed day never shifts with the server's timezone; instants are
 * rendered in the signed-in user's timezone (CLAUDE.md "Dates").
 */

const formatters = new Map<string, Intl.DateTimeFormat>();

function dateTimeFormat(locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale}|${JSON.stringify(options)}`;
  let df = formatters.get(key);
  if (!df) {
    df = new Intl.DateTimeFormat(locale, options);
    formatters.set(key, df);
  }
  return df;
}

/** "1 Apr 2026" (en-IN) · "Apr 1, 2026" (en-US). Throws RangeError for a malformed date string. */
export function formatDate(s: DateString, locale: string): string {
  const df = dateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" });
  return normaliseIntlSpaces(df.format(fromDateString(s)));
}

/** "1 Apr 2026, 4:00 pm" (en-IN, Asia/Kolkata) · "Apr 1, 2026, 6:30 AM" (en-US, America/New_York). */
export function formatDateTime(d: Date, locale: string, timeZone: string): string {
  const df = dateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone });
  return normaliseIntlSpaces(df.format(d));
}
