import { z } from "zod";
import { minorUnits } from "@/lib/money";

/** The seven three-decimal currencies; money columns are Decimal(14,2) so they are not supported (v2 §23 #5). */
const THREE_DECIMAL = new Set(["BHD", "IQD", "JOD", "KWD", "LYD", "OMR", "TND"]);

export const CurrencySchema = z
  .string()
  .trim()
  .length(3, "must be a three-letter ISO 4217 code")
  .toUpperCase()
  .superRefine((code, ctx) => {
    if (THREE_DECIMAL.has(code)) {
      ctx.addIssue({ code: "custom", message: "three-decimal currencies are not supported" });
      return;
    }
    try {
      const units = minorUnits(code);
      if (units !== 0 && units !== 2) {
        ctx.addIssue({ code: "custom", message: `unsupported minor units (${units})` });
      }
    } catch {
      ctx.addIssue({ code: "custom", message: `unknown currency code ${code}` });
    }
  });

export type Currency = z.infer<typeof CurrencySchema>;

export const COMMON_CURRENCIES = [
  "INR",
  "USD",
  "EUR",
  "GBP",
  "AUD",
  "CAD",
  "SGD",
  "AED",
  "JPY",
  "CHF",
] as const;
