import type { Decimal } from "@/lib/money";
import {
  SUPPLY_STATEMENTS,
  type TaxComponent,
  type TaxContext,
  type TaxDetermination,
} from "./types";

const vat = (taxRate: Decimal): TaxComponent[] => [{ taxType: "VAT", rate: taxRate }];

/**
 * UK VAT (SPEC.md §4.7): VAT at the per-line rate; a reverse-charge supply prints the UK
 * statement and carries no tax lines. GST supply types do not apply, so NOT_APPLICABLE.
 */
export function determineUkVat(ctx: TaxContext): TaxDetermination {
  if (ctx.isReverseCharge) {
    return {
      supplyType: "REVERSE_CHARGE",
      statement: SUPPLY_STATEMENTS.UK_REVERSE_CHARGE,
      placeOfSupplyRequired: false,
      components: null,
    };
  }
  return { supplyType: "NOT_APPLICABLE", placeOfSupplyRequired: false, components: vat };
}
