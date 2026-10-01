import { isValidTimeZone } from "@/lib/dates";

/**
 * ICU still lists some zones under legacy names (Asia/Calcutta) while browsers report the modern
 * IANA names (Asia/Kolkata); both must be selectable so a detected zone always matches an option.
 */
const MODERN_ALIASES = [
  "Asia/Kolkata",
  "Asia/Yangon",
  "Asia/Ho_Chi_Minh",
  "Asia/Kathmandu",
  "Asia/Dhaka",
  "Asia/Thimphu",
  "Asia/Macau",
  "Asia/Ulaanbaatar",
  "Europe/Kyiv",
  "America/Nuuk",
  "America/Argentina/Buenos_Aires",
  "Atlantic/Faroe",
  "Africa/Asmara",
  "Pacific/Kanton",
  "UTC",
];

/** IANA zones known to this Node build plus modern aliases, sorted. */
export const TIMEZONES: readonly string[] = (() => {
  const zones = new Set<string>(Intl.supportedValuesOf("timeZone"));
  for (const z of MODERN_ALIASES) if (isValidTimeZone(z)) zones.add(z);
  return [...zones].sort();
})();
