import Decimal from "decimal.js";

/**
 * All money math in okinvo goes through this module (CLAUDE.md "Money"). Values are decimal.js
 * Decimals; rounding is half-up to the currency's minor units and happens only where SPEC.md
 * §4.6–4.9 say it does.
 */
Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

export { Decimal };

export const D = (v: Decimal.Value): Decimal => new Decimal(v);
export const ZERO: Decimal = new Decimal(0);

const minorUnitsCache = new Map<string, number>();

/** Minor units from Intl: INR/USD → 2, JPY/KRW → 0. Throws RangeError for unknown codes. */
export function minorUnits(currency: string): number {
  const code = currency.toUpperCase();
  const cached = minorUnitsCache.get(code);
  if (cached !== undefined) return cached;
  // Intl accepts any well-formed three-letter code, so also require a real symbol/name mapping:
  // DisplayNames returns the code itself for unknown currencies.
  const name = new Intl.DisplayNames(["en"], { type: "currency", fallback: "code" }).of(code);
  if (!name || name === code) throw new RangeError(`Unknown currency code: ${currency}`);
  const units = new Intl.NumberFormat("en", { style: "currency", currency: code }).resolvedOptions()
    .maximumFractionDigits;
  minorUnitsCache.set(code, units);
  return units;
}

/** Half-up to the currency's minor units — the only rounding rule okinvo uses for money. */
export function roundMoney(v: Decimal.Value, currency: string): Decimal {
  return new Decimal(v).toDecimalPlaces(minorUnits(currency), Decimal.ROUND_HALF_UP);
}

export function sum(xs: Decimal.Value[]): Decimal {
  return xs.reduce<Decimal>((acc, x) => acc.plus(x), ZERO);
}

/**
 * Apportion `amount` across `weights` so the rounded parts sum exactly to the rounded amount
 * (largest-remainder method). Zero total weight splits equally; no weights → no parts.
 */
export function apportion(
  amount: Decimal.Value,
  weights: Decimal.Value[],
  currency: string,
): Decimal[] {
  if (weights.length === 0) return [];
  const total = roundMoney(amount, currency);
  const ws = weights.map((w) => new Decimal(w));
  const weightSum = sum(ws);
  const shares = weightSum.isZero()
    ? ws.map(() => new Decimal(1).div(ws.length))
    : ws.map((w) => w.div(weightSum));
  const exact = shares.map((s) => total.mul(s));
  const floorStep = new Decimal(10).pow(-minorUnits(currency));
  const floored = exact.map((e) => e.toDecimalPlaces(minorUnits(currency), Decimal.ROUND_DOWN));
  let remainder = total.minus(sum(floored));
  // Distribute leftover minor units to the largest fractional remainders, first-come on ties.
  const order = exact
    .map((e, i) => ({ i, frac: e.minus(floored[i]!) }))
    .sort((a, b) => b.frac.comparedTo(a.frac) || a.i - b.i);
  const result = floored.slice();
  for (const { i } of order) {
    if (remainder.lte(0)) break;
    result[i] = result[i]!.plus(floorStep);
    remainder = remainder.minus(floorStep);
  }
  return result;
}

/** Fixed minor units, no grouping: "1234.50", "1500". For CSV cells and database writes. */
export function toMoneyString(v: Decimal.Value, currency: string): string {
  return roundMoney(v, currency).toFixed(minorUnits(currency));
}
