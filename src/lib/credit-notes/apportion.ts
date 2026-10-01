import { D, ZERO, apportion, roundMoney, sum, type Decimal } from "@/lib/money";
import type { TaxType } from "@/lib/tax";

/**
 * Credit notes are amount-based (SPEC.md §4.9, v2 §23 #2): the credit amount excludes tax, and
 * tax is apportioned pro-rata across the invoice's tax lines by taxable amount. Each part's tax is
 * rounded to the currency's minor units, mirroring the invoice's own per-component rounding.
 *
 * The apportioning runs *within each tax type*: the CGST lines of an intra-state invoice partition
 * its taxable amount, and so do the SGST lines (each pair shares one taxable base), so the parts of
 * every tax type sum exactly to the credit amount (largest remainder). Apportioning across all
 * lines at once would spread the credit over twice the taxable value and halve the tax.
 */
export interface CreditNoteTaxLine {
  taxType: TaxType;
  rate: Decimal;
  taxableAmount: Decimal;
  taxAmount: Decimal;
}

export interface CreditNoteTaxResult {
  taxLines: CreditNoteTaxLine[];
  taxAmount: Decimal;
  /** creditSubtotal + taxAmount. */
  total: Decimal;
}

export function creditNoteTaxLines(
  invoiceTaxLines: { taxType: TaxType; rate: Decimal; taxableAmount: Decimal }[],
  creditSubtotal: Decimal,
  currency: string,
): CreditNoteTaxResult {
  const subtotal = roundMoney(creditSubtotal, currency);
  if (subtotal.isNegative()) {
    throw new Error(`Credit amount must not be negative (got ${subtotal.toString()})`);
  }

  const byType = new Map<TaxType, number[]>();
  invoiceTaxLines.forEach((t, i) => {
    const indices = byType.get(t.taxType);
    if (indices) indices.push(i);
    else byType.set(t.taxType, [i]);
  });
  const parts: Decimal[] = invoiceTaxLines.map(() => ZERO);
  for (const indices of byType.values()) {
    const weights = indices.map((i) => invoiceTaxLines[i]?.taxableAmount ?? ZERO);
    apportion(subtotal, weights, currency).forEach((part, k) => {
      const i = indices[k];
      if (i !== undefined) parts[i] = part;
    });
  }

  const taxLines = invoiceTaxLines.map((t, i) => {
    const taxableAmount = parts[i] ?? ZERO;
    const rate = D(t.rate);
    return {
      taxType: t.taxType,
      rate,
      taxableAmount,
      taxAmount: roundMoney(taxableAmount.mul(rate).div(100), currency),
    };
  });
  const taxAmount = sum(taxLines.map((t) => t.taxAmount));
  return { taxLines, taxAmount, total: subtotal.plus(taxAmount) };
}
