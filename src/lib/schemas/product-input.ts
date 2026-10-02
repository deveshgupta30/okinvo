import { z } from "zod";
import { fBool, fDecimal, fOptional } from "@/lib/forms";
import { CurrencySchema } from "./currency";
import { UNIT_TYPES } from "./service-input";

/** Stock-keeping unit: letters, digits, dot, underscore, slash, dash; 1–40 characters (spec §5.1). */
export const SKU_RE = /^[A-Za-z0-9._/-]{1,40}$/;

export const SkuSchema = z
  .string()
  .trim()
  .regex(SKU_RE, "letters, digits, . _ / - only, up to 40 characters");

export const ProductInputSchema = z.object({
  sku: SkuSchema,
  name: z.string().trim().min(1, "required").max(200),
  description: fOptional(z.string().trim().max(2000)),
  unitType: z.enum(UNIT_TYPES).default("UNIT"),
  unitPrice: fDecimal(2).refine((v) => Number(v) >= 0, { message: "must not be negative" }),
  currency: CurrencySchema,
  hsnCode: fOptional(z.string().trim().max(10)),
  defaultTaxRate: fDecimal(2).refine((v) => Number(v) >= 0 && Number(v) <= 100, {
    message: "must be between 0 and 100",
  }),
  isActive: fBool.default(true),
  issuerProfileIds: z.array(z.string()).max(50).default([]),
});

export type ProductInput = z.infer<typeof ProductInputSchema>;
