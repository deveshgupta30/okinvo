import { D, Decimal, ZERO, apportion, minorUnits, roundMoney, sum } from "@/lib/money";
import type { TaxResult } from "@/lib/tax";

/**
 * Invoice arithmetic (SPEC.md §4.6 "Amounts", v2 §8.3). Pure and browser-safe: the builder's live
 * preview and the issue transaction run exactly this code (plan R5).
 *
 *   lineSubtotal       = round(quantity × unitPrice)
 *   subtotal           = Σ lineSubtotal
 *   discountAmount     = fixed amount, or round(subtotal × pct)
 *   taxableAmount      = subtotal − discountAmount   (apportioned across lines for per-line tax)
 *   taxAmount          = Σ taxLines.taxAmount        (tax engine, §4.7)
 *   total              = taxableAmount + taxAmount + roundingAdjustment   (|adj| < 1)
 *   tdsExpected        = round(taxableAmount × tdsRate)
 *   netExpected        = total − tdsExpected
 */
export interface TotalsInput {
  currency: string;
  items: { position: number; quantity: Decimal; unitPrice: Decimal; taxRate: Decimal }[];
  discount?: { type: "AMOUNT" | "PERCENT"; value: Decimal } | null;
  roundingAdjustment?: Decimal | null;
  /** Percentage, e.g. D("10") for 10 % under §194J. Informational only. */
  tdsRate?: Decimal | null;
}

export interface LineComputation {
  position: number;
  lineSubtotal: Decimal;
  /** lineSubtotal less this line's share of the invoice-level discount. */
  taxableAmount: Decimal;
  taxRate: Decimal;
}

export interface Totals {
  subtotal: Decimal;
  discountAmount: Decimal;
  taxableAmount: Decimal;
  taxAmount: Decimal;
  roundingAdjustment: Decimal;
  total: Decimal;
  tdsExpected: Decimal;
  netExpected: Decimal;
  /** Printed per-line figures; lineTotal = lineSubtotal + line tax (the discount prints as its own row). */
  items: { position: number; lineSubtotal: Decimal; taxAmount: Decimal; lineTotal: Decimal }[];
}

const HUNDRED = D(100);

/** The invoice-level discount in money, validated against the subtotal. */
function discountAmountFor(
  discount: TotalsInput["discount"],
  subtotal: Decimal,
  currency: string,
): Decimal {
  if (!discount) return ZERO;
  const value = D(discount.value);
  if (value.isNegative()) {
    throw new Error(`Discount must not be negative (got ${value.toString()})`);
  }
  if (discount.type === "PERCENT" && value.gt(HUNDRED)) {
    throw new Error(`Discount percentage must not exceed 100 (got ${value.toString()})`);
  }
  const amount =
    discount.type === "PERCENT"
      ? roundMoney(subtotal.mul(value).div(HUNDRED), currency)
      : roundMoney(value, currency);
  if (amount.gt(subtotal)) {
    throw new Error(
      `Discount (${amount.toString()}) exceeds the subtotal (${subtotal.toString()}) in ${currency}`,
    );
  }
  return amount;
}

/** Per-line subtotal and taxable amount, with the invoice-level discount apportioned pro-rata. */
export function computeLines(input: TotalsInput): LineComputation[] {
  const { currency } = input;
  const subtotals = input.items.map((item) =>
    roundMoney(D(item.quantity).mul(item.unitPrice), currency),
  );
  const discountAmount = discountAmountFor(input.discount, sum(subtotals), currency);
  const discountParts = discountAmount.isZero()
    ? subtotals.map(() => ZERO)
    : apportion(discountAmount, subtotals, currency);
  return input.items.map((item, i) => {
    const lineSubtotal = subtotals[i] ?? ZERO;
    const part = discountParts[i] ?? ZERO;
    return {
      position: item.position,
      lineSubtotal,
      taxableAmount: lineSubtotal.minus(part),
      taxRate: D(item.taxRate),
    };
  });
}

/** |adj| < 1: the adjustment only ever nudges the total to a whole unit (SPEC.md §4.6). */
export function isValidRoundingAdjustment(adj: Decimal): boolean {
  return D(adj).abs().lt(1);
}

/**
 * The adjustment that brings `total` to the nearest whole currency unit (Indian practice), or 0
 * for zero-decimal currencies where every total is already whole.
 */
export function suggestRoundingAdjustment(total: Decimal, currency: string): Decimal {
  if (minorUnits(currency) === 0) return ZERO;
  const t = D(total);
  const whole = t.toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  return whole.minus(t);
}

/** The full SPEC §4.6 set of figures; `tax` must come from `computeTax` over `computeLines(input)`. */
export function computeTotals(input: TotalsInput, tax: TaxResult): Totals {
  const { currency } = input;
  const lines = computeLines(input);

  const subtotal = sum(lines.map((l) => l.lineSubtotal));
  const taxableAmount = sum(lines.map((l) => l.taxableAmount));
  const discountAmount = subtotal.minus(taxableAmount);
  const taxAmount = sum(tax.taxLines.map((t) => t.taxAmount));

  const roundingAdjustment = D(input.roundingAdjustment ?? 0);
  if (!isValidRoundingAdjustment(roundingAdjustment)) {
    throw new Error(
      `Rounding adjustment must be less than one whole unit (got ${roundingAdjustment.toString()})`,
    );
  }

  const total = taxableAmount.plus(taxAmount).plus(roundingAdjustment);
  const tdsRate = D(input.tdsRate ?? 0);
  const tdsExpected = tdsRate.isZero()
    ? ZERO
    : roundMoney(taxableAmount.mul(tdsRate).div(HUNDRED), currency);
  const netExpected = total.minus(tdsExpected);

  const lineTax = new Map(tax.lines.map((l) => [l.position, l.taxAmount]));
  const items = lines.map((l) => {
    const lineTaxAmount = lineTax.get(l.position) ?? ZERO;
    return {
      position: l.position,
      lineSubtotal: l.lineSubtotal,
      taxAmount: lineTaxAmount,
      lineTotal: l.lineSubtotal.plus(lineTaxAmount),
    };
  });

  return {
    subtotal,
    discountAmount,
    taxableAmount,
    taxAmount,
    roundingAdjustment,
    total,
    tdsExpected,
    netExpected,
    items,
  };
}
