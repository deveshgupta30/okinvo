import type { DateString } from "@/lib/dates";
import type { ExportFormat } from "./types";

/**
 * `okinvo-<dataset>-<from>_<to>.<ext>` (SPEC §4.11). An open-ended range fills the missing end with
 * "start" or the generation date; a dataset with no date range (clients, services, unfiltered
 * registers) is named after the generation date alone.
 */
export function exportFilename(
  dataset: string,
  format: ExportFormat | "zip",
  range: { from?: DateString | undefined; to?: DateString | undefined } | null,
  today: DateString,
): string {
  const span =
    range && (range.from || range.to) ? `${range.from ?? "start"}_${range.to ?? today}` : today;
  return `okinvo-${dataset}-${span}.${format}`;
}
