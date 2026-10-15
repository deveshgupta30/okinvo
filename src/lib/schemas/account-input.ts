import { z } from "zod";
import { isValidTimeZone } from "@/lib/dates";
import { LANGUAGE_TAGS } from "@/lib/i18n/languages";
import { CurrencySchema } from "./currency";

export const THEME_MODES = ["system", "light", "dark"] as const;

/** How the person uses okinvo (onboarding, spec §4.2); informational, it changes defaults only. */
export const USAGES = ["PERSONAL", "BUSINESS"] as const;
export type Usage = (typeof USAGES)[number];

/**
 * Settings → Account. `locale` is one of the UI languages (`src/lib/i18n/languages.ts`). Country
 * and currency are the defaults for new issuer profiles and for the dashboard before the first
 * profile exists.
 */
export const AccountInputSchema = z.object({
  name: z.string().trim().min(1, "required").max(120),
  timezone: z.string().refine(isValidTimeZone, { message: "unknown timezone" }),
  theme: z.enum(THEME_MODES).optional(),
  locale: z.enum(LANGUAGE_TAGS, { error: "unknown language" }).optional(),
  countryCode: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{2}$/, "two-letter country code")
    .transform((s) => s.toUpperCase())
    .optional(),
  currency: CurrencySchema.optional(),
});

export type AccountInput = z.infer<typeof AccountInputSchema>;
