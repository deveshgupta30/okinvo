import { z } from "zod";
import { fBool, fOptional } from "@/lib/forms";
import { isValidGbVat, normaliseGbVat } from "@/lib/tax/vat-gb";
import { isValidGstin, normaliseGstin } from "@/lib/tax/gstin";
import { USAGES } from "./account-input";
import { CurrencySchema } from "./currency";

/** Step 1 — "Tell us about you": name, country, currency (the e-mail is the sign-in identity). */
export const OnboardingStep1Schema = z.object({
  name: z.string().trim().min(1, "required").max(120),
  countryCode: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{2}$/, "choose a country")
    .transform((s) => s.toUpperCase()),
  currency: CurrencySchema,
});
export type OnboardingStep1 = z.infer<typeof OnboardingStep1Schema>;

/**
 * Step 2 — usage and, for India or the UK, the tax registration. `countryCode` is carried from
 * step 1 so the right validator runs; `taxId` is normalised and only kept when claimed.
 */
export const OnboardingStep2Schema = z
  .object({
    usage: z.enum(USAGES),
    hasTaxId: fBool.default(false),
    taxId: fOptional(z.string().trim().max(40)),
    countryCode: z
      .string()
      .trim()
      .regex(/^[A-Za-z]{2}$/)
      .transform((s) => s.toUpperCase()),
  })
  .transform((v, ctx) => {
    if (!v.hasTaxId) return { ...v, taxId: undefined };
    const raw = v.taxId ?? "";
    if (v.countryCode === "IN") {
      if (!isValidGstin(raw)) {
        ctx.addIssue({
          code: "custom",
          path: ["taxId"],
          message: "not a valid GSTIN (check digit)",
        });
        return z.NEVER;
      }
      return { ...v, taxId: normaliseGstin(raw) };
    }
    if (v.countryCode === "GB") {
      if (!isValidGbVat(raw)) {
        ctx.addIssue({ code: "custom", path: ["taxId"], message: "not a valid UK VAT number" });
        return z.NEVER;
      }
      return { ...v, taxId: normaliseGbVat(raw) };
    }
    return { ...v, taxId: raw || undefined };
  });
export type OnboardingStep2 = z.infer<typeof OnboardingStep2Schema>;
