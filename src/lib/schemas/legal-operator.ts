import { z } from "zod";
import { DateStringSchema } from "@/lib/dates";
import { fOptional } from "@/lib/forms";
import { CountryCodeSchema } from "./address";

/**
 * Who operates this instance (spec §6.4): the details the legal pages print. Everything is
 * optional in storage - a fresh instance has nothing - and each page renders an unset field as a
 * highlighted placeholder until the owner fills it in at Settings → Legal.
 */
const text = (max: number) => fOptional(z.string().trim().min(1).max(max));
const email = fOptional(z.email().max(254));

export const LegalOperatorSchema = z.object({
  legalName: text(120),
  entityType: fOptional(z.enum(["INDIVIDUAL", "COMPANY"])),
  address: text(400),
  country: fOptional(CountryCodeSchema),
  contactEmail: email,
  privacyEmail: email,
  dpoEmail: email,
  governingLaw: text(120),
  venue: text(160),
  effectiveDate: fOptional(DateStringSchema),
});

export type LegalOperator = z.infer<typeof LegalOperatorSchema>;

export const EMPTY_LEGAL_OPERATOR: LegalOperator = {};

/** Fields the legal pages need before they read as finished; the Settings page lists them. */
export const LEGAL_REQUIRED_FIELDS: readonly (keyof LegalOperator)[] = [
  "legalName",
  "entityType",
  "address",
  "country",
  "contactEmail",
  "privacyEmail",
  "governingLaw",
  "venue",
  "effectiveDate",
];

export const LEGAL_FIELD_LABELS: Record<keyof LegalOperator, string> = {
  legalName: "Operator legal name",
  entityType: "Entity type",
  address: "Operator address",
  country: "Operator country",
  contactEmail: "Contact e-mail",
  privacyEmail: "Privacy e-mail",
  dpoEmail: "Data protection officer e-mail",
  governingLaw: "Governing law",
  venue: "Venue for disputes",
  effectiveDate: "Effective date",
};

export function missingLegalFields(op: LegalOperator): (keyof LegalOperator)[] {
  return LEGAL_REQUIRED_FIELDS.filter((k) => op[k] === undefined || op[k] === "");
}
