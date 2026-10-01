import { D, Decimal, minorUnits, roundMoney } from "@/lib/money";

/**
 * Locale-aware money and number formatting (SPEC.md §4.10, v2 §8.7). Everything is formatted
 * from the Decimal's exact string form: `Intl.NumberFormat.format` accepts decimal strings, so no
 * amount is ever converted to a `number` (CLAUDE.md "Money").
 */

export type CurrencyDisplay = "symbol" | "code";

/**
 * ICU separates the ISO code from the amount (and some symbols from the amount) with U+00A0 or
 * U+202F. Documents, exports and tests want a plain space.
 */
export function normaliseIntlSpaces(s: string): string {
  return s.replace(/[  ]/g, " ");
}

// Constructing an Intl.NumberFormat is expensive and these run per cell of a preview or export.
const formatters = new Map<string, Intl.NumberFormat>();

function numberFormat(locale: string, options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = `${locale}|${JSON.stringify(options)}`;
  let nf = formatters.get(key);
  if (!nf) {
    nf = new Intl.NumberFormat(locale, options);
    formatters.set(key, nf);
  }
  return nf;
}

/**
 * Decimal → exact string for Intl, with `-0` (from rounding a tiny negative) printed as zero.
 * `Decimal.toFixed` never uses exponent notation, so the result is always a numeric literal.
 */
function fixed(v: Decimal, decimals?: number): Intl.StringNumericLiteral {
  const value = v.isZero() ? v.abs() : v;
  const literal = decimals === undefined ? value.toFixed() : value.toFixed(decimals);
  return literal as Intl.StringNumericLiteral;
}

/** "₹12,34,567.00" (en-IN, symbol) · "$1,234,567.00" (en-US) · "INR 1,234.00" (code). */
export function formatMoney(
  v: Decimal.Value,
  currency: string,
  locale: string,
  display: CurrencyDisplay = "symbol",
): string {
  const code = currency.toUpperCase();
  const units = minorUnits(code);
  const nf = numberFormat(locale, {
    style: "currency",
    currency: code,
    currencyDisplay: display,
    minimumFractionDigits: units,
    maximumFractionDigits: units,
  });
  return normaliseIntlSpaces(nf.format(fixed(roundMoney(v, code), units)));
}

/** Number only, grouped per locale, minor units fixed: "12,34,567.50", "1,500" (JPY). */
export function formatAmount(v: Decimal.Value, currency: string, locale: string): string {
  const code = currency.toUpperCase();
  const units = minorUnits(code);
  const nf = numberFormat(locale, {
    style: "decimal",
    useGrouping: true,
    minimumFractionDigits: units,
    maximumFractionDigits: units,
  });
  return normaliseIntlSpaces(nf.format(fixed(roundMoney(v, code), units)));
}

/** Up to three decimals, trailing zeros trimmed, grouped per locale: "2.5", "10", "1,234.5". */
export function formatQuantity(v: Decimal.Value, locale: string): string {
  const q = D(v).toDecimalPlaces(3, Decimal.ROUND_HALF_UP);
  const nf = numberFormat(locale, {
    style: "decimal",
    useGrouping: true,
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  });
  return normaliseIntlSpaces(nf.format(fixed(q)));
}

/** "18%" / "2.5%" — the rate as entered, without trailing zeros. */
export function formatPercent(v: Decimal.Value): string {
  return `${fixed(D(v))}%`;
}
