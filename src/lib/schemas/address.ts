import { z } from "zod";

/**
 * Structured postal address stored in `IssuerProfile.address`, `Client.billingAddress` and
 * `Client.shippingAddress` (SPEC.md §4.2, §4.3). Browser-safe: no Node APIs.
 */

/** ISO 3166-1 alpha-2, upper-cased. Shared with the snapshot schemas. */
export const CountryCodeSchema = z
  .string()
  .trim()
  .length(2, "must be a two-letter ISO 3166-1 country code")
  .regex(/^[A-Za-z]{2}$/, "must be a two-letter ISO 3166-1 country code")
  .toUpperCase();

export const AddressSchema = z.object({
  line1: z.string().trim().min(1).max(120),
  line2: z.string().trim().max(120).optional(),
  city: z.string().trim().min(1).max(80),
  state: z.string().trim().max(80).optional(),
  postalCode: z.string().trim().max(20).optional(),
  countryCode: CountryCodeSchema,
});

export type Address = z.infer<typeof AddressSchema>;

let regionNames: Intl.DisplayNames | undefined;

/** English country name for an alpha-2 code ("IN" → "India"); the code itself when unknown. */
export function countryName(code: string): string {
  const upper = code.toUpperCase();
  try {
    regionNames ??= new Intl.DisplayNames(["en"], { type: "region", fallback: "code" });
    return regionNames.of(upper) ?? upper;
  } catch {
    return upper;
  }
}

const clean = (s: string | undefined): string => (s ?? "").trim();

/**
 * Printable lines: line1, line2, "city, state postalCode", country name. Empty parts are
 * skipped so a minimal address prints without blank lines.
 */
export function formatAddressLines(a: Address): string[] {
  const cityState = [a.city, a.state].map(clean).filter(Boolean).join(", ");
  const cityLine = [cityState, clean(a.postalCode)].filter(Boolean).join(" ");
  return [a.line1, a.line2, cityLine, countryName(a.countryCode)].map(clean).filter(Boolean);
}
