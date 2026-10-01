import type { Decimal } from "@/lib/money";

/**
 * Tax engine types (SPEC.md §4.7, v2 §8.2). The string unions mirror the Prisma enums of the same
 * name; they are deliberately not imported from the generated client so this module can run in the
 * browser for the builder's live preview (plan R5).
 */
export type TaxRegime = "INDIA_GST" | "UK_VAT" | "US_SALES_TAX" | "NONE";

export type SupplyType =
  | "INTRA_STATE"
  | "INTER_STATE"
  | "EXPORT_LUT"
  | "EXPORT_WITH_TAX"
  | "REVERSE_CHARGE"
  | "NOT_APPLICABLE";

export type TaxType = "CGST" | "SGST" | "IGST" | "VAT" | "SALES_TAX" | "OTHER";

export interface TaxContext {
  regime: TaxRegime;
  /** ISO 4217 code of the invoice; decides the minor units every component is rounded to. */
  currency: string;
  /** Fiscal year label of the invoice (e.g. "2026-27"); compared with the issuer's LUT year. */
  fiscalYear: string;
  isReverseCharge: boolean;
  issuer: {
    countryCode: string;
    gstStateCode?: string | null;
    gstin?: string | null;
    lutNumber?: string | null;
    lutFiscalYear?: string | null;
    ukVatNumber?: string | null;
  };
  client: { countryCode: string; gstStateCode?: string | null };
}

/** A line after the invoice-level discount has been apportioned (invoices/totals `computeLines`). */
export interface TaxableLine {
  position: number;
  taxableAmount: Decimal;
  /** Percentage, e.g. D("18"). */
  taxRate: Decimal;
}

export interface TaxLineResult {
  taxType: TaxType;
  /** Percentage of this component, e.g. CGST at D("9") for an 18 % item rate. */
  rate: Decimal;
  /** Σ taxableAmount of the lines charged at this (taxType, rate). */
  taxableAmount: Decimal;
  /** Σ of the per-line, per-component rounded tax — never re-rounded. */
  taxAmount: Decimal;
}

export interface TaxResult {
  supplyType: SupplyType;
  /** One entry per input line, in input order; taxAmount is 0 when the supply carries no tax. */
  lines: { position: number; taxAmount: Decimal }[];
  /** Aggregated by (taxType, rate) in first-seen order; empty when the supply carries no tax. */
  taxLines: TaxLineResult[];
  /** Printed statement for the supply type, when the regime defines one. */
  statement?: string;
  /** Whether the document must carry a place of supply (India GST, registered issuer). */
  placeOfSupplyRequired: boolean;
}

/** One tax component charged on a line, e.g. CGST at half the item rate. */
export interface TaxComponent {
  taxType: TaxType;
  rate: Decimal;
}

/**
 * What a regime decides for an invoice before any arithmetic: the supply type, the statement to
 * print and how an item rate splits into components. `components` is null when the supply type
 * carries no tax lines at all (EXPORT_LUT, REVERSE_CHARGE, NOT_APPLICABLE, NONE).
 */
export interface TaxDetermination {
  supplyType: SupplyType;
  statement?: string;
  placeOfSupplyRequired: boolean;
  components: ((taxRate: Decimal) => TaxComponent[]) | null;
}

export const GST_RATES = ["0", "5", "12", "18", "28"] as const;
export const UK_VAT_RATES = ["20", "5", "0"] as const;

export const SUPPLY_STATEMENTS: Record<
  "EXPORT_LUT" | "EXPORT_WITH_TAX" | "REVERSE_CHARGE" | "NOT_APPLICABLE" | "UK_REVERSE_CHARGE",
  string
> = {
  EXPORT_LUT: "Supply meant for export under LUT without payment of IGST",
  EXPORT_WITH_TAX: "Supply meant for export on payment of IGST",
  REVERSE_CHARGE: "Tax payable on reverse charge basis",
  NOT_APPLICABLE: "Not registered under GST",
  UK_REVERSE_CHARGE: "Reverse charge: customer to account for VAT",
};
