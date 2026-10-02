import { z } from "zod";
import { isValidTimeZone } from "@/lib/dates";
import { CurrencySchema } from "./currency";

export const THEME_MODES = ["system", "light", "dark"] as const;

/** How the person uses okinvo (onboarding, spec §4.2); informational, it changes defaults only. */
export const USAGES = ["PERSONAL", "BUSINESS"] as const;
export type Usage = (typeof USAGES)[number];

/**
 * Settings → Account. `locale` is a BCP-47 tag; Task 33 narrows it to the supported language
 * table once that exists. Country and currency are the defaults for new issuer profiles and for
 * the dashboard before the first profile exists.
 */
export const AccountInputSchema = z.object({
  name: z.string().trim().min(1, "required").max(120),
  timezone: z.string().refine(isValidTimeZone, { message: "unknown timezone" }),
  theme: z.enum(THEME_MODES),
  locale: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/, "unknown language")
    .optional(),
  countryCode: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{2}$/, "two-letter country code")
    .transform((s) => s.toUpperCase())
    .optional(),
  currency: CurrencySchema.optional(),
});

export type AccountInput = z.infer<typeof AccountInputSchema>;
