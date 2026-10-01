import { placeOfSupplyLabel } from "@/lib/countries";
import { D } from "@/lib/money";
import { countryName } from "@/lib/schemas/address";
import { computeTax, type TaxRegime, type TaxResult } from "@/lib/tax";
import { computeLines, computeTotals, type LineComputation, type Totals } from "./totals";

/**
 * The one invoice computation path (lines → tax → totals), shared by the DAL and the builder's
 * live preview so what the screen shows is what the issue transaction stores. Pure; browser-safe.
 */
export interface IssuerForTax {
  countryCode: string;
  gstStateCode: string | null;
  gstin: string | null;
  lutNumber: string | null;
  lutFiscalYear: string | null;
  ukVatNumber: string | null;
}

export interface ClientForTax {
  countryCode: string;
  gstStateCode: string | null;
}

export interface ComputeParams {
  currency: string;
  items: { position: number; quantity: string; unitPrice: string; taxRate: string }[];
  discount: { type: "AMOUNT" | "PERCENT"; value: string } | null;
  roundingAdjustment: string | null;
  tdsRate: string;
  taxRegime: TaxRegime;
  isReverseCharge: boolean;
  fiscalYear: string;
}

export interface Computed {
  tax: TaxResult;
  totals: Totals;
  lines: LineComputation[];
}

export function computeInvoice(
  p: ComputeParams,
  issuer: IssuerForTax,
  client: ClientForTax,
): Computed {
  const totalsInput = {
    currency: p.currency,
    items: p.items.map((i) => ({
      position: i.position,
      quantity: D(i.quantity),
      unitPrice: D(i.unitPrice),
      taxRate: D(i.taxRate),
    })),
    discount: p.discount ? { type: p.discount.type, value: D(p.discount.value) } : null,
    roundingAdjustment: p.roundingAdjustment ? D(p.roundingAdjustment) : null,
    tdsRate: D(p.tdsRate),
  };
  const lines = computeLines(totalsInput);
  const tax = computeTax(
    {
      regime: p.taxRegime,
      currency: p.currency,
      fiscalYear: p.fiscalYear,
      isReverseCharge: p.isReverseCharge,
      issuer,
      client,
    },
    lines.map((l) => ({
      position: l.position,
      taxableAmount: l.taxableAmount,
      taxRate: l.taxRate,
    })),
  );
  const totals = computeTotals(totalsInput, tax);
  return { tax, totals, lines };
}

/** "Karnataka (29)" within India, the country name for exports, nothing outside GST. */
export function placeOfSupplyFor(regime: TaxRegime, client: ClientForTax): string | null {
  if (regime !== "INDIA_GST") return null;
  if (client.countryCode.toUpperCase() === "IN") return placeOfSupplyLabel(client.gstStateCode);
  return countryName(client.countryCode);
}
