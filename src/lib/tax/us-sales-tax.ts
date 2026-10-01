import type { Decimal } from "@/lib/money";
import type { TaxComponent, TaxDetermination } from "./types";

const salesTax = (taxRate: Decimal): TaxComponent[] => [{ taxType: "SALES_TAX", rate: taxRate }];

/** US sales tax (SPEC.md §4.7): a manually entered rate per line, no jurisdiction lookup. */
export function determineUsSalesTax(): TaxDetermination {
  return { supplyType: "NOT_APPLICABLE", placeOfSupplyRequired: false, components: salesTax };
}
