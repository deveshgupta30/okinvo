import { z } from "zod";
import { fBool, fDecimal, fOptional } from "@/lib/forms";
import { CurrencySchema } from "./currency";

export const UNIT_TYPES = ["HOUR", "DAY", "FIXED", "MILESTONE", "UNIT"] as const;
export type UnitType = (typeof UNIT_TYPES)[number];
export const UNIT_LABELS: Record<UnitType, string> = {
  HOUR: "Hour",
  DAY: "Day",
  FIXED: "Fixed",
  MILESTONE: "Milestone",
  UNIT: "Unit",
};

export const ServiceInputSchema = z.object({
  name: z.string().trim().min(1, "required").max(200),
  description: fOptional(z.string().trim().max(2000)),
  unitType: z.enum(UNIT_TYPES),
  defaultRate: fDecimal(2).refine((v) => Number(v) >= 0, { message: "must not be negative" }),
  currency: CurrencySchema,
  sacHsnCode: fOptional(z.string().trim().max(10)),
  defaultTaxRate: fDecimal(2).refine((v) => Number(v) >= 0 && Number(v) <= 100, {
    message: "must be between 0 and 100",
  }),
  isActive: fBool.default(true),
});

export type ServiceInput = z.infer<typeof ServiceInputSchema>;
