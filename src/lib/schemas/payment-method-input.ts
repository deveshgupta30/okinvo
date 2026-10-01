import { z } from "zod";
import { fBool, fOptional } from "@/lib/forms";
import { CurrencySchema } from "./currency";
import { PAYMENT_METHOD_TYPES, PaymentMethodDetailsSchema } from "./payment-method-details";

export const PAYMENT_METHOD_LABELS: Record<(typeof PAYMENT_METHOD_TYPES)[number], string> = {
  BANK_TRANSFER: "Bank transfer",
  UPI: "UPI",
  WISE: "Wise",
  REVOLUT: "Revolut",
  PAYPAL: "PayPal",
  CUSTOM: "Custom",
};

export const PaymentMethodInputSchema = z
  .object({
    name: z.string().trim().min(1, "required").max(80),
    type: z.enum(PAYMENT_METHOD_TYPES),
    currency: fOptional(CurrencySchema),
    instructions: fOptional(z.string().trim().max(500)),
    isDefault: fBool.default(false),
    isActive: fBool.default(true),
    details: PaymentMethodDetailsSchema,
  })
  .superRefine((v, ctx) => {
    if (v.details.type !== v.type) {
      ctx.addIssue({ code: "custom", path: ["details"], message: "details do not match the type" });
    }
  });

export type PaymentMethodInput = z.infer<typeof PaymentMethodInputSchema>;
