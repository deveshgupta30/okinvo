import { minorUnits } from "@/lib/money";

export interface CurrencyInfo {
  code: string;
  minorUnits: number;
}

/** Every ISO 4217 code this runtime's Intl knows, alphabetical. Names come from `currencyName`. */
export const CURRENCIES: readonly CurrencyInfo[] = Intl.supportedValuesOf("currency")
  .map((code) => {
    let units = 2;
    try {
      units = minorUnits(code);
    } catch {
      units = 2;
    }
    return { code, minorUnits: units };
  })
  .sort((a, b) => a.code.localeCompare(b.code));

const names = new Map<string, Intl.DisplayNames>();
function displayNames(locale: string): Intl.DisplayNames {
  let d = names.get(locale);
  if (!d) {
    d = new Intl.DisplayNames([locale], { type: "currency", fallback: "code" });
    names.set(locale, d);
  }
  return d;
}

/** "Indian Rupee", "US Dollar" … in `locale`; the code when Intl has no name. */
export function currencyName(code: string, locale = "en"): string {
  try {
    return displayNames(locale).of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

/** `pinned` codes first (in the given order), then the rest in their existing order. */
export function pinnedFirst<T extends { code: string }>(
  items: readonly T[],
  pinned: readonly string[],
): T[] {
  const first = pinned
    .map((code) => items.find((i) => i.code === code))
    .filter((i): i is T => i !== undefined);
  return [...first, ...items.filter((i) => !pinned.includes(i.code))];
}
