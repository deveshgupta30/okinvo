import type { TaxDetermination } from "./types";

/** No tax regime (SPEC.md §4.7): never any tax lines; a free-text note is the renderer's concern. */
export function determineNone(): TaxDetermination {
  return { supplyType: "NOT_APPLICABLE", placeOfSupplyRequired: false, components: null };
}
