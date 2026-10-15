import type Decimal from "decimal.js";
import { D, roundMoney } from "@/lib/money";
import { RatesError, type RateTable } from "./index";

function rateOf(table: RateTable, code: string): Decimal {
  const raw = table.rates[code];
  if (raw === undefined) throw new RatesError(`No rate for ${code} in the ${table.asOf} table.`);
  const rate = D(raw);
  if (!rate.isFinite() || rate.lte(0)) {
    throw new RatesError(`The rate for ${code} in the ${table.asOf} table is not usable.`);
  }
  return rate;
}

/**
 * `amount` of `from` expressed in `to`, through the table's USD base (`amount / rate(from) *
 * rate(to)`) with Decimal math, rounded half-up to the target currency's minor units. The same
 * currency comes back untouched, not even rounded, so a form echoes what was typed.
 */
export function convert(
  amount: Decimal.Value,
  from: string,
  to: string,
  table: RateTable,
): Decimal {
  const f = from.toUpperCase();
  const t = to.toUpperCase();
  if (f === t) return D(amount);
  const inBase = D(amount).div(rateOf(table, f));
  return roundMoney(inBase.mul(rateOf(table, t)), t);
}
