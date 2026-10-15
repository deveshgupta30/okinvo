import { z } from "zod";
import { DateStringSchema } from "@/lib/dates";
import { fDecimal, fIdList, fOptional } from "@/lib/forms";
import { D } from "@/lib/money";
import { CurrencySchema } from "./currency";

export const PAYMENT_KINDS = ["PAYMENT", "REFUND", "WRITE_OFF"] as const;

/** SPEC §4.8: one ledger entry. Amounts are in the invoice currency; refunds are negative. */
export const PaymentInputSchema = z
  .object({
    kind: z.enum(PAYMENT_KINDS),
    paymentDate: DateStringSchema,
    amountApplied: fDecimal(2),
    tdsDeducted: fDecimal(2).default("0.00"),
    receivedAmount: fOptional(fDecimal(2)),
    receivedCurrency: fOptional(CurrencySchema),
    exchangeRate: fOptional(fDecimal(8)),
    bankFees: fDecimal(2)
      .refine((v) => D(v).gte(0), { message: "must not be negative" })
      .default("0.00"),
    paymentMethodProfileId: fOptional(z.string().max(64)),
    reference: fOptional(z.string().trim().max(120)),
    notes: fOptional(z.string().trim().max(2000)),
    /** Receipts and bills (addendum §4): ids of uploaded RECEIPT assets, in display order. */
    attachmentAssetIds: fIdList,
  })
  .superRefine((v, ctx) => {
    const amount = D(v.amountApplied);
    const tds = D(v.tdsDeducted);
    if (v.kind === "REFUND") {
      if (!amount.isNegative() || amount.isZero()) {
        ctx.addIssue({
          code: "custom",
          path: ["amountApplied"],
          message: "a refund is a negative amount",
        });
      }
    } else if (amount.lte(0)) {
      ctx.addIssue({
        code: "custom",
        path: ["amountApplied"],
        message: "must be greater than zero",
      });
    }
    if (tds.isNegative()) {
      ctx.addIssue({ code: "custom", path: ["tdsDeducted"], message: "must not be negative" });
    }
    if (v.kind === "PAYMENT" && tds.gt(amount)) {
      ctx.addIssue({
        code: "custom",
        path: ["tdsDeducted"],
        message: "cannot exceed the amount applied",
      });
    }
    if (v.kind !== "PAYMENT" && !tds.isZero()) {
      ctx.addIssue({ code: "custom", path: ["tdsDeducted"], message: "only payments carry TDS" });
    }
    const fxGiven = [v.receivedAmount, v.receivedCurrency, v.exchangeRate].filter(Boolean).length;
    if (fxGiven > 0 && fxGiven < 3) {
      for (const key of ["receivedAmount", "receivedCurrency", "exchangeRate"] as const) {
        if (!v[key])
          ctx.addIssue({
            code: "custom",
            path: [key],
            message: "required with the other FX fields",
          });
      }
    }
    if (v.exchangeRate && D(v.exchangeRate).lte(0)) {
      ctx.addIssue({
        code: "custom",
        path: ["exchangeRate"],
        message: "must be greater than zero",
      });
    }
  });

export type PaymentInput = z.infer<typeof PaymentInputSchema>;
