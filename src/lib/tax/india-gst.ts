import type { Decimal } from "@/lib/money";
import {
  SUPPLY_STATEMENTS,
  type TaxComponent,
  type TaxContext,
  type TaxDetermination,
} from "./types";

const present = (s: string | null | undefined): s is string =>
  typeof s === "string" && s.trim().length > 0;

const country = (code: string): string => code.trim().toUpperCase();

/** Intra-state: the item rate splits evenly into CGST and SGST (18 → 9 + 9, 5 → 2.5 + 2.5). */
const cgstSgst = (taxRate: Decimal): TaxComponent[] => {
  const half = taxRate.div(2);
  return [
    { taxType: "CGST", rate: half },
    { taxType: "SGST", rate: half },
  ];
};

/** Inter-state and export-with-tax: IGST at the full item rate. */
const igst = (taxRate: Decimal): TaxComponent[] => [{ taxType: "IGST", rate: taxRate }];

/**
 * The determination table of SPEC.md §4.7, in the order the rows take precedence:
 * no GSTIN → reverse charge → export (LUT for this FY, else with IGST) → same state → other state.
 */
export function determineIndiaGst(ctx: TaxContext): TaxDetermination {
  const { issuer, client } = ctx;

  if (!present(issuer.gstin)) {
    return {
      supplyType: "NOT_APPLICABLE",
      statement: SUPPLY_STATEMENTS.NOT_APPLICABLE,
      placeOfSupplyRequired: false,
      components: null,
    };
  }

  if (ctx.isReverseCharge) {
    return {
      supplyType: "REVERSE_CHARGE",
      statement: SUPPLY_STATEMENTS.REVERSE_CHARGE,
      placeOfSupplyRequired: true,
      components: null,
    };
  }

  if (country(client.countryCode) !== "IN") {
    const lutValid = present(issuer.lutNumber) && issuer.lutFiscalYear === ctx.fiscalYear;
    return lutValid
      ? {
          supplyType: "EXPORT_LUT",
          statement: SUPPLY_STATEMENTS.EXPORT_LUT,
          placeOfSupplyRequired: true,
          components: null,
        }
      : {
          supplyType: "EXPORT_WITH_TAX",
          statement: SUPPLY_STATEMENTS.EXPORT_WITH_TAX,
          placeOfSupplyRequired: true,
          components: igst,
        };
  }

  const sameState =
    present(issuer.gstStateCode) &&
    present(client.gstStateCode) &&
    issuer.gstStateCode.trim() === client.gstStateCode.trim();

  return sameState
    ? { supplyType: "INTRA_STATE", placeOfSupplyRequired: true, components: cgstSgst }
    : { supplyType: "INTER_STATE", placeOfSupplyRequired: true, components: igst };
}
