import { z } from "zod";
import { isValidTimeZone } from "@/lib/dates";

export const THEME_MODES = ["system", "light", "dark"] as const;

export const AccountInputSchema = z.object({
  name: z.string().trim().min(1, "required").max(120),
  timezone: z.string().refine(isValidTimeZone, { message: "unknown timezone" }),
  theme: z.enum(THEME_MODES),
});

export type AccountInput = z.infer<typeof AccountInputSchema>;
