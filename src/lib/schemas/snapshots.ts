import { z } from "zod";
import { DateStringSchema } from "@/lib/dates";
import { AddressSchema, CountryCodeSchema } from "./address";
import { CurrencySchema } from "./currency";
import { PAYMENT_METHOD_TYPES } from "./payment-method-details";

/**
 * Snapshots frozen into issued documents (IMPLEMENTATION_PLAN_v2.md §7.3): exactly what the
 * renderer needs, nothing more. The DAL builds them from the display config in force at issue
 * time, so a field the config hid is simply absent here and a later toggle cannot leak it into a
 * re-render. Enum values mirror the Prisma enums as string unions (browser-safe).
 */

export const ISSUER_TYPES = ["INDIVIDUAL", "COMPANY"] as const;
export type IssuerType = (typeof ISSUER_TYPES)[number];

export const TAX_ID_TYPES = ["GSTIN", "VAT", "EIN", "OTHER"] as const;
export type TaxIdType = (typeof TAX_ID_TYPES)[number];

export const TAX_REGIMES = ["INDIA_GST", "UK_VAT", "US_SALES_TAX", "NONE"] as const;
export type TaxRegime = (typeof TAX_REGIMES)[number];

/** Money in JSON is a plain decimal string ("11800.00"), never a number (CLAUDE.md "Money"). */
export const DecimalStringSchema = z
  .string()
  .regex(/^-?\d+(\.\d+)?$/, "must be a plain decimal string such as 1234.50");

const text = (max: number) => z.string().trim().max(max);
const optionalText = (max: number) => text(max).optional();
const addressLines = z.array(text(200)).max(8);
const gstStateCode = z.string().regex(/^\d{2}$/, "must be a two-digit GST state code");

export const IssuerSnapshotSchema = z.object({
  type: z.enum(ISSUER_TYPES),
  legalName: text(200).min(1),
  tradeName: optionalText(200),
  designation: optionalText(120),
  email: z.email().optional(),
  phone: optionalText(40),
  website: optionalText(200),
  addressLines,
  countryCode: CountryCodeSchema,
  stateCode: optionalText(10),
  gstStateCode: gstStateCode.optional(),
  pan: optionalText(20),
  gstin: optionalText(20),
  cin: optionalText(30),
  ukVatNumber: optionalText(20),
  lutNumber: optionalText(30),
  lutFiscalYear: optionalText(10),
  logoAssetId: optionalText(64),
  signatureAssetId: optionalText(64),
  stampAssetId: optionalText(64),
  locale: text(35).min(2),
  baseCurrency: CurrencySchema,
  /**
   * E-invoicing (spec §9e): the structured address and Peppol identifier, frozen at issue for
   * the e-invoice builders; the renderers print `addressLines` and never these.
   */
  address: AddressSchema.optional(),
  electronicAddress: optionalText(100),
  electronicAddressScheme: optionalText(10),
});

export type IssuerSnapshot = z.infer<typeof IssuerSnapshotSchema>;

export const ClientSnapshotSchema = z.object({
  displayName: text(200).min(1),
  contactPerson: optionalText(120),
  email: z.email().optional(),
  phone: optionalText(40),
  billingAddressLines: addressLines,
  shippingAddressLines: addressLines.optional(),
  countryCode: CountryCodeSchema,
  stateCode: optionalText(10),
  gstStateCode: gstStateCode.optional(),
  taxIdType: z.enum(TAX_ID_TYPES).optional(),
  taxId: optionalText(40),
  paymentTermsDays: z.number().int().min(0).max(3650),
  /** E-invoicing (spec §9e): structured billing address and identifiers, never printed. */
  address: AddressSchema.optional(),
  buyerReference: optionalText(80),
  electronicAddress: optionalText(100),
  electronicAddressScheme: optionalText(10),
});

export type ClientSnapshot = z.infer<typeof ClientSnapshotSchema>;

export const PaymentMethodsSnapshotSchema = z
  .array(
    z.object({
      name: text(80).min(1),
      type: z.enum(PAYMENT_METHOD_TYPES),
      instructions: optionalText(500),
      lines: z.array(z.object({ label: text(40), value: text(200).min(1) })).max(20),
    }),
  )
  .max(10);

export type PaymentMethodsSnapshot = z.infer<typeof PaymentMethodsSnapshotSchema>;

export const CreditNoteSnapshotSchema = z.object({
  issuer: IssuerSnapshotSchema,
  client: ClientSnapshotSchema,
  invoice: z.object({
    number: text(40).min(1),
    issueDate: DateStringSchema,
    currency: CurrencySchema,
    total: DecimalStringSchema,
    taxRegime: z.enum(TAX_REGIMES),
    placeOfSupply: optionalText(80),
  }),
});

export type CreditNoteSnapshot = z.infer<typeof CreditNoteSnapshotSchema>;
