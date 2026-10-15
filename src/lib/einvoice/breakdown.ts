import { D, apportion, roundMoney, type Decimal } from "@/lib/money";
import { taxCategory, type TaxCategory } from "./codes";
import type { EInvoiceInput, EInvoiceLine } from "./input";

/**
 * What both EN 16931 outputs need from an invoice beyond its lines: each line's category and
 * net amount after the invoice-level discount is spread over the lines, and the VAT breakdown
 * per category and rate whose amounts sum to the invoice's own totals (BR-CO-10 to BR-CO-15).
 */
export interface LineView {
  line: EInvoiceLine;
  category: TaxCategory;
  /** Net amount before the discount (quantity times price). */
  gross: Decimal;
  /** Share of the invoice-level discount. */
  discount: Decimal;
  /** Net amount after the discount, the line's tax basis. */
  net: Decimal;
}

export interface TaxBreakdownRow {
  category: TaxCategory;
  rate: string;
  basis: Decimal;
  tax: Decimal;
}

export function lineViews(input: EInvoiceInput): LineView[] {
  const subtotal = D(input.totals.subtotal);
  const discount = D(input.totals.discountAmount);
  const shares =
    discount.isZero() || subtotal.isZero()
      ? input.lines.map(() => D(0))
      : apportion(
          discount,
          input.lines.map((l) => D(l.lineSubtotal).div(subtotal)),
          input.currency,
        );
  return input.lines.map((line, i) => {
    const gross = D(line.lineSubtotal);
    const share = shares[i] ?? D(0);
    return {
      line,
      category: taxCategory({
        regime: input.taxRegime,
        rate: line.taxRate,
        exempt: line.taxExempt,
        reverseCharge: input.isReverseCharge,
        exportUnderLut: input.supplyType === "EXPORT_LUT",
      }),
      gross,
      discount: share,
      net: roundMoney(gross.minus(share), input.currency),
    };
  });
}

/**
 * One row per category and rate. The basis is the sum of the lines' nets; the tax is taken
 * from the invoice's own tax lines at that rate when it has them (the issue-time figures),
 * else basis times rate. The last row absorbs the rounding so the rows sum to the totals.
 */
export function taxBreakdown(input: EInvoiceInput, views: LineView[]): TaxBreakdownRow[] {
  const rows = new Map<string, TaxBreakdownRow>();
  for (const v of views) {
    const rate = D(v.line.taxRate).toString();
    const key = `${v.category}:${rate}`;
    const row = rows.get(key) ?? { category: v.category, rate, basis: D(0), tax: D(0) };
    row.basis = row.basis.plus(v.net);
    rows.set(key, row);
  }
  const taxByRate = new Map<string, Decimal>();
  for (const t of input.taxLines) {
    const rate = D(t.rate).toString();
    taxByRate.set(rate, (taxByRate.get(rate) ?? D(0)).plus(t.taxAmount));
  }
  const out = [...rows.values()];
  for (const row of out) {
    const taxed = row.category === "S" || row.category === "Z";
    row.tax =
      taxed && Number(row.rate) > 0
        ? (taxByRate.get(row.rate) ?? roundMoney(row.basis.mul(row.rate).div(100), input.currency))
        : D(0);
  }
  // the lines' nets add up to the taxable amount except for apportioning rounding: settle it here
  const basisTotal = out.reduce((n, r) => n.plus(r.basis), D(0));
  const diff = D(input.totals.taxableAmount).minus(basisTotal);
  const last = out[out.length - 1];
  if (last && !diff.isZero()) last.basis = last.basis.plus(diff);
  const taxTotal = out.reduce((n, r) => n.plus(r.tax), D(0));
  const taxDiff = D(input.totals.taxAmount).minus(taxTotal);
  const lastTaxed = [...out].reverse().find((r) => r.tax.gt(0));
  if (lastTaxed && !taxDiff.isZero()) lastTaxed.tax = lastTaxed.tax.plus(taxDiff);
  return out;
}

export const money = (v: Decimal.Value) => D(v).toFixed(2);
