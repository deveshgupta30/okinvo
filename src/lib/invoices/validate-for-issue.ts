import { compareDates, type DateString } from "@/lib/dates";
import type { TaxRegime } from "@/lib/tax";

export interface DraftForIssue {
  taxRegime: TaxRegime;
  issueDate: DateString;
  dueDate: DateString;
  isReverseCharge: boolean;
  items: { position: number; description: string; sacHsnCode: string | null }[];
  issuer: { countryCode: string; gstin: string | null; gstStateCode: string | null };
  client: { countryCode: string; gstStateCode: string | null; email: string | null };
}

/** Everything that must hold before a number is consumed (SPEC §4.6/§4.7). Pure. */
export function validateForIssue(d: DraftForIssue): string[] {
  const errors: string[] = [];
  if (d.items.length === 0) errors.push("Add at least one line item.");
  if (compareDates(d.dueDate, d.issueDate) < 0) {
    errors.push("The due date must not be before the issue date.");
  }
  const gstApplies = d.taxRegime === "INDIA_GST" && Boolean(d.issuer.gstin?.trim());
  if (gstApplies) {
    const missing = d.items.filter((i) => !i.sacHsnCode?.trim()).map((i) => i.position);
    if (missing.length > 0) {
      errors.push(
        `SAC/HSN code is required on every line under GST (missing on line ${missing.join(", ")}).`,
      );
    }
    if (!d.issuer.gstStateCode) errors.push("The issuer profile needs a GST state code.");
    if (d.client.countryCode.toUpperCase() === "IN" && !d.client.gstStateCode) {
      errors.push("The client's GST state is required for a supply within India.");
    }
  }
  return errors;
}
