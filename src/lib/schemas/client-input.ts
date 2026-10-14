import { z } from "zod";
import { fDecimal, fInt, fOptional } from "@/lib/forms";
import { EAS_CODES } from "@/lib/einvoice/eas";
import { LANGUAGE_TAGS } from "@/lib/i18n/languages";
import { AddressSchema, CountryCodeSchema } from "./address";
import { CurrencySchema } from "./currency";
import { TAX_ID_TYPES } from "./snapshots";

const short = (max: number) => fOptional(z.string().trim().max(max));

export const ClientInputSchema = z
  .object({
    displayName: z.string().trim().min(1, "required").max(200),
    contactPerson: short(120),
    email: fOptional(z.email("must be a valid email")),
    phone: short(40),
    billingAddress: AddressSchema,
    shippingAddress: AddressSchema.nullable().optional(),
    countryCode: CountryCodeSchema,
    stateCode: short(10),
    gstStateCode: fOptional(z.string().regex(/^\d{2}$/, "two digits")),
    taxIdType: fOptional(z.enum(TAX_ID_TYPES)),
    taxId: short(40),
    currency: CurrencySchema,
    paymentTermsDays: fInt.pipe(z.number().min(0).max(365)),
    defaultTdsRate: fOptional(fDecimal(2)).refine(
      (v) => v === undefined || (Number(v) >= 0 && Number(v) <= 100),
      { message: "must be between 0 and 100" },
    ),
    notes: fOptional(z.string().trim().max(2000)),
    /** The language this client's documents print in; empty follows the issuer profile. */
    preferredLocale: fOptional(z.enum(LANGUAGE_TAGS, { error: "unknown language" })),
    /** E-invoicing (spec §9e): the buyer's own reference and its Peppol electronic address. */
    buyerReference: short(80),
    electronicAddress: short(100),
    electronicAddressScheme: fOptional(z.enum(EAS_CODES, { error: "unknown scheme" })),
  })
  .superRefine((v, ctx) => {
    if (Boolean(v.electronicAddress) !== Boolean(v.electronicAddressScheme)) {
      ctx.addIssue({
        code: "custom",
        path: [v.electronicAddress ? "electronicAddressScheme" : "electronicAddress"],
        message: "the electronic address and its scheme go together",
      });
    }
    if (v.taxIdType && !v.taxId) {
      ctx.addIssue({ code: "custom", path: ["taxId"], message: "required with a tax ID type" });
    }
    if (v.taxIdType === "GSTIN" && !v.gstStateCode) {
      ctx.addIssue({
        code: "custom",
        path: ["gstStateCode"],
        message: "required for GST-registered clients",
      });
    }
  });

export type ClientInput = z.infer<typeof ClientInputSchema>;
