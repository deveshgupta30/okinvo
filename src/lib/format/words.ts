import { minorUnits, roundMoney, type Decimal } from "@/lib/money";

/**
 * Amount in words for printed documents (SPEC.md §4.7, v2 §8.7): Indian numbering (crore / lakh /
 * thousand / hundred) for Indian-region locales, short scale (trillion / billion / million /
 * thousand) otherwise. Output: `<Major> <words> [and <words> <Minor>] Only`, tens hyphenated
 * ("Thirty-Four"), no "and" inside the major part.
 */

export const CURRENCY_WORDS: Record<string, { major: string; minor: string }> = {
  INR: { major: "Rupees", minor: "Paise" },
  USD: { major: "US Dollars", minor: "Cents" },
  GBP: { major: "Pounds", minor: "Pence" },
  EUR: { major: "Euros", minor: "Cents" },
  JPY: { major: "Yen", minor: "" },
  AUD: { major: "Australian Dollars", minor: "Cents" },
  CAD: { major: "Canadian Dollars", minor: "Cents" },
  SGD: { major: "Singapore Dollars", minor: "Cents" },
  AED: { major: "Dirhams", minor: "Fils" },
  CHF: { major: "Swiss Francs", minor: "Rappen" },
};

const ONES = [
  "",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

// The digit groups below are plain integers 0–999 (table indices), never amounts.

function belowHundred(n: number): string {
  if (n < 20) return ONES[n] ?? "";
  const tens = TENS[Math.floor(n / 10)] ?? "";
  const ones = n % 10;
  return ones ? `${tens}-${ONES[ones]}` : tens;
}

function belowThousand(n: number): string {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  const parts: string[] = [];
  if (hundreds) parts.push(`${ONES[hundreds]} Hundred`);
  if (rest) parts.push(belowHundred(rest));
  return parts.join(" ");
}

const join = (...parts: string[]): string => parts.filter(Boolean).join(" ");

const CRORE = 10_000_000n;
const LAKH = 100_000n;
const THOUSAND = 1_000n;

/** Indian numbering; beyond 99 crore it continues in crore ("One Hundred Crore", "One Lakh Crore"). */
function indian(n: bigint): string {
  if (n >= CRORE) return join(`${indian(n / CRORE)} Crore`, indian(n % CRORE));
  const lakh = n / LAKH;
  const thousand = (n % LAKH) / THOUSAND;
  const rest = n % THOUSAND;
  return join(
    lakh ? `${belowHundred(Number(lakh))} Lakh` : "",
    thousand ? `${belowHundred(Number(thousand))} Thousand` : "",
    belowThousand(Number(rest)),
  );
}

const SHORT_SCALE: readonly (readonly [bigint, string])[] = [
  [1_000_000_000_000n, "Trillion"],
  [1_000_000_000n, "Billion"],
  [1_000_000n, "Million"],
  [THOUSAND, "Thousand"],
];

function shortScale(n: bigint): string {
  for (const [value, name] of SHORT_SCALE) {
    if (n >= value) return join(`${shortScale(n / value)} ${name}`, shortScale(n % value));
  }
  return belowThousand(Number(n));
}

function usesIndianNumbering(locale: string): boolean {
  try {
    return new Intl.Locale(locale).maximize().region === "IN";
  } catch {
    return false;
  }
}

function currencyNames(code: string): { major: string; minor: string } {
  const known = CURRENCY_WORDS[code];
  if (known) return known;
  const name = new Intl.DisplayNames(["en"], { type: "currency", fallback: "code" }).of(code);
  return { major: name ?? code, minor: "Cents" };
}

/**
 * "Rupees Twelve Lakh Thirty-Four Thousand Five Hundred Sixty-Seven and Fifty Paise Only".
 * Rounds half-up to the currency's minor units first; zero-decimal currencies never print a minor
 * part; zero prints as "<Major> Zero Only"; a negative amount is prefixed with "Minus".
 * Throws RangeError for an unknown currency code.
 */
export function amountInWords(v: Decimal.Value, currency: string, locale: string): string {
  const code = currency.toUpperCase();
  const units = minorUnits(code);
  const names = currencyNames(code);
  const rounded = roundMoney(v, code);
  const negative = rounded.isNegative() && !rounded.isZero();
  const [majorDigits = "0", minorDigits = ""] = rounded.abs().toFixed(units).split(".");
  const major = BigInt(majorDigits);
  const minor = minorDigits ? Number(minorDigits) : 0;
  const toWords = usesIndianNumbering(locale) ? indian : shortScale;
  const majorWords = major === 0n ? "Zero" : toWords(major);
  const minorWords = minor > 0 && names.minor ? ` and ${belowThousand(minor)} ${names.minor}` : "";
  return `${negative ? "Minus " : ""}${names.major} ${majorWords}${minorWords} Only`;
}
