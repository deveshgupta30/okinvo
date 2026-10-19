import { z } from "zod";
import { DateStringSchema } from "@/lib/dates";
import { fDecimal } from "@/lib/forms";
import { D } from "@/lib/money";
import { DisplayConfigSchema } from "./display-config";

/** SPEC §4.9: amount-based - a reason and a credit amount excluding tax. */
export const CreditNoteInputSchema = z.object({
  invoiceId: z.string().min(1, "choose an invoice"),
  reason: z.string().trim().min(1, "required").max(500),
  subtotal: fDecimal(2).refine((v) => D(v).gt(0), { message: "must be greater than zero" }),
  issueDate: DateStringSchema,
  displayConfig: DisplayConfigSchema.optional(),
});

export type CreditNoteInput = z.infer<typeof CreditNoteInputSchema>;
