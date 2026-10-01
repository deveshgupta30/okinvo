import { D, ZERO, roundMoney } from "@/lib/money";
import { determineIndiaGst } from "./india-gst";
import { determineNone } from "./none";
import type {
  TaxContext,
  TaxDetermination,
  TaxLineResult,
  TaxRegime,
  TaxResult,
  TaxableLine,
} from "./types";
import { determineUkVat } from "./uk-vat";
import { determineUsSalesTax } from "./us-sales-tax";

const DETERMINE: Record<TaxRegime, (ctx: TaxContext) => TaxDetermination> = {
  INDIA_GST: determineIndiaGst,
  UK_VAT: determineUkVat,
  US_SALES_TAX: determineUsSalesTax,
  NONE: determineNone,
};

/** The regime's decision for this invoice, without touching the lines. */
export function determineTax(ctx: TaxContext): TaxDetermination {
  const determine = DETERMINE[ctx.regime];
  if (!determine) throw new Error(`Unknown tax regime: ${String(ctx.regime)}`);
  return determine(ctx);
}

/**
 * Turn taxable lines into per-line tax and aggregated tax lines (SPEC.md §4.7 "Rounding
 * (decided)", v2 §23 #3): tax is computed per line and per component, each rounded half-up to the
 * currency's minor units, then summed into tax lines keyed by (taxType, rate) in first-seen
 * order. Nothing is rounded again afterwards, so the printed table always foots.
 */
export function applyTaxDetermination(
  determination: TaxDetermination,
  lines: TaxableLine[],
  currency: string,
): TaxResult {
  const { components } = determination;
  const result: TaxResult = {
    supplyType: determination.supplyType,
    lines: [],
    taxLines: [],
    placeOfSupplyRequired: determination.placeOfSupplyRequired,
  };
  if (determination.statement !== undefined) result.statement = determination.statement;

  if (components === null) {
    result.lines = lines.map((l) => ({ position: l.position, taxAmount: ZERO }));
    return result;
  }

  const buckets = new Map<string, TaxLineResult>();
  for (const line of lines) {
    let lineTax = ZERO;
    for (const component of components(line.taxRate)) {
      const rate = D(component.rate);
      const taxAmount = roundMoney(line.taxableAmount.mul(rate).div(100), currency);
      lineTax = lineTax.plus(taxAmount);

      const key = `${component.taxType}:${rate.toString()}`;
      const bucket = buckets.get(key);
      if (bucket) {
        bucket.taxableAmount = bucket.taxableAmount.plus(line.taxableAmount);
        bucket.taxAmount = bucket.taxAmount.plus(taxAmount);
      } else {
        buckets.set(key, {
          taxType: component.taxType,
          rate,
          taxableAmount: line.taxableAmount,
          taxAmount,
        });
      }
    }
    result.lines.push({ position: line.position, taxAmount: lineTax });
  }
  result.taxLines = [...buckets.values()];
  return result;
}

/** Entry point used by the builder preview, the issue transaction and the credit-note flow. */
export function computeTax(ctx: TaxContext, lines: TaxableLine[]): TaxResult {
  return applyTaxDetermination(determineTax(ctx), lines, ctx.currency);
}
