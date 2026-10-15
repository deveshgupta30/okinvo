import type { UnitType } from "@/lib/schemas/service-input";
import type { TaxRegime } from "@/lib/schemas";

/**
 * Code lists shared by the EN 16931 outputs (CII and UBL, spec §9e): UN/ECE Recommendation 20
 * unit codes and the UNCL 5305 VAT category codes with their VATEX exemption reasons.
 */
export function unitCode(unitType: UnitType): "HUR" | "DAY" | "C62" {
  switch (unitType) {
    case "HOUR":
      return "HUR";
    case "DAY":
      return "DAY";
    default:
      return "C62";
  }
}

export type TaxCategory = "S" | "Z" | "E" | "AE" | "K" | "G" | "O";

export interface TaxCategoryInput {
  regime: TaxRegime;
  /** Percent as a decimal string ("20", "0"). */
  rate: string;
  exempt: boolean;
  reverseCharge: boolean;
  exportUnderLut: boolean;
}

/**
 * S standard, Z zero-rated, E exempt, AE reverse charge, G export outside the tax area,
 * O not subject to VAT (the NONE regime). K (intra-community) is never derived: okinvo has no
 * EU member-state regime.
 */
export function taxCategory(i: TaxCategoryInput): TaxCategory {
  if (i.regime === "NONE") return "O";
  if (i.reverseCharge) return "AE";
  if (i.exportUnderLut) return "G";
  if (i.exempt) return "E";
  return Number(i.rate) === 0 ? "Z" : "S";
}

/** VATEX code and text for the categories that need an exemption reason (BR-E-10, BR-AE-10, BR-G-10, BR-O-10). */
export function vatExemptionReason(
  category: TaxCategory,
): { code: string; text: string } | undefined {
  switch (category) {
    case "AE":
      return { code: "VATEX-EU-AE", text: "Reverse charge" };
    case "G":
      return { code: "VATEX-EU-G", text: "Export outside the tax area" };
    case "E":
      return { code: "VATEX-EU-132", text: "Exempt" };
    case "O":
      return { code: "VATEX-EU-O", text: "Not subject to VAT" };
    default:
      return undefined;
  }
}

/** UNCL 4461 payment means: SEPA credit transfer with an IBAN, else a plain credit transfer. */
export function paymentMeansCode(hasIban: boolean): "58" | "30" {
  return hasIban ? "58" : "30";
}
