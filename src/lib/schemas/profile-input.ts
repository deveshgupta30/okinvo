import { z } from "zod";
import { fDecimal, fEmailList, fInt, fOptional } from "@/lib/forms";
import { hasFiscalYearToken, NumberFormatSchema } from "@/lib/numbering";
import { AddressSchema, CountryCodeSchema } from "./address";
import { CurrencySchema } from "./currency";
import { DisplayConfigSchema } from "./display-config";
import { ISSUER_TYPES, TAX_REGIMES } from "./snapshots";
import { TemplateConfigSchema } from "./template-config";

export const LOCALES = [
  "en-IN",
  "en-GB",
  "en-US",
  "en-AU",
  "en-CA",
  "en-SG",
  "en-AE",
  "de-DE",
  "fr-FR",
] as const;
export type Locale = (typeof LOCALES)[number];

export const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
export const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

const short = (max: number) => fOptional(z.string().trim().max(max));
const text = (max: number) => fOptional(z.string().trim().max(max));
const rate = fOptional(fDecimal(2)).refine(
  (v) => v === undefined || (Number(v) >= 0 && Number(v) <= 100),
  { message: "must be between 0 and 100" },
);

export const ProfileInputSchema = z
  .object({
    type: z.enum(ISSUER_TYPES),
    label: z.string().trim().min(1, "required").max(80),
    legalName: z.string().trim().min(1, "required").max(200),
    tradeName: short(200),
    designation: short(80),
    email: z.email("must be a valid email"),
    phone: short(40),
    website: short(200),
    address: AddressSchema,
    countryCode: CountryCodeSchema,
    stateCode: short(10),
    gstStateCode: fOptional(z.string().regex(/^\d{2}$/, "two digits")),
    panNumber: fOptional(z.string().trim().toUpperCase().regex(PAN_RE, "not a valid PAN")),
    gstin: fOptional(z.string().trim().toUpperCase().regex(GSTIN_RE, "not a valid GSTIN")),
    cinNumber: short(30),
    ukVatNumber: short(20),
    usTaxId: short(20),
    lutNumber: short(40),
    lutFiscalYear: fOptional(z.string().regex(/^\d{4}(-\d{2})?$/, "e.g. 2026-27")),
    baseCurrency: CurrencySchema,
    locale: z.enum(LOCALES),
    fiscalYearStartMonth: fInt.pipe(z.number().min(1).max(12)),
    invoiceNumberFormat: NumberFormatSchema,
    creditNoteNumberFormat: NumberFormatSchema,
    defaultTaxRegime: z.enum(TAX_REGIMES),
    defaultTdsRate: rate,
    defaultDisplayConfig: DisplayConfigSchema.optional(),
    defaultNotes: text(2000),
    defaultTerms: text(2000),
    emailCc: fEmailList.default([]),
    emailBcc: fEmailList.default([]),
    emailInvoiceSubject: text(200),
    emailInvoiceBody: text(4000),
    emailCreditNoteSubject: text(200),
    emailCreditNoteBody: text(4000),
    templateConfigOverride: TemplateConfigSchema.nullable().optional(),
    logoAssetId: short(64),
    signatureAssetId: short(64),
    stampAssetId: short(64),
  })
  .superRefine((v, ctx) => {
    if (v.gstin && v.gstStateCode && v.gstin.slice(0, 2) !== v.gstStateCode) {
      ctx.addIssue({
        code: "custom",
        path: ["gstStateCode"],
        message: "must match the first two digits of the GSTIN",
      });
    }
    if (v.gstin && !v.gstStateCode) {
      ctx.addIssue({ code: "custom", path: ["gstStateCode"], message: "required with a GSTIN" });
    }
    if (v.lutNumber && !v.lutFiscalYear) {
      ctx.addIssue({ code: "custom", path: ["lutFiscalYear"], message: "required with an LUT" });
    }
    // {YYYY}/{YY} change in January while the sequence resets at the fiscal-year start: unless
    // the two coincide, a calendar-year format can repeat a number (e.g. 2027-001 twice).
    if (v.fiscalYearStartMonth !== 1) {
      for (const key of ["invoiceNumberFormat", "creditNoteNumberFormat"] as const) {
        if (!hasFiscalYearToken(v[key])) {
          ctx.addIssue({
            code: "custom",
            path: [key],
            message: "use {FY} or {FYYYY} when the fiscal year does not start in January",
          });
        }
      }
    }
  });

export type ProfileInput = z.infer<typeof ProfileInputSchema>;
