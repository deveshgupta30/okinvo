import { findCountry } from "./countries";
import { countryForTimeZone } from "./timezone-country";

export const DEFAULT_COUNTRY = "IN";
export const DEFAULT_CURRENCY = "INR";

/**
 * Pre-selects a country for onboarding (spec §4.2) without any external service: the browser's
 * timezone, then the region of its language tag, then India.
 */
export function guessCountry(input: {
  timeZone?: string | null | undefined;
  language?: string | null | undefined;
}): string {
  const fromZone = countryForTimeZone(input.timeZone);
  if (fromZone && findCountry(fromZone)) return fromZone;
  const region = regionOfLanguage(input.language);
  if (region && findCountry(region)) return region;
  return DEFAULT_COUNTRY;
}

/** "en-GB" → "GB", "pt-BR" → "BR"; null when the tag carries no region. */
export function regionOfLanguage(tag: string | null | undefined): string | null {
  if (!tag) return null;
  try {
    const region = new Intl.Locale(tag).maximize().region;
    if (!region || !/^[A-Z]{2}$/.test(region)) return null;
    // maximize() invents a likely region for bare languages ("en" → "US"); only trust explicit ones
    return /-[A-Za-z]{2}(-|$)/.test(tag) ? region : null;
  } catch {
    return null;
  }
}

export function currencyForCountry(code: string | null | undefined): string {
  return findCountry(code)?.currency ?? DEFAULT_CURRENCY;
}
