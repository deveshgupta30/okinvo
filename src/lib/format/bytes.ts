/** `1536` → "2 kB" (en-US) / "2 kB" (de, with the locale's grouping): whole kilobytes, at least one. */
export function formatKilobytes(bytes: number, locale: string): string {
  const kb = Math.max(1, Math.round(bytes / 1024));
  return new Intl.NumberFormat(locale, {
    style: "unit",
    unit: "kilobyte",
    unitDisplay: "short",
    maximumFractionDigits: 0,
  }).format(kb);
}
