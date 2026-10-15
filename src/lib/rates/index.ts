import { z } from "zod";

/**
 * Exchange rates (addendum §5): one table, USD based, `rates[code]` = units of `code` per USD as
 * decimal strings. The bundled copy lives in `data/exchange-rates.json` (refreshed on a connected
 * machine by `pnpm vendor:update rates`); an optional daily live refresh stores newer tables in
 * `ExchangeRateSnapshot`. Everything downstream converts through `convert()` with Decimal math.
 */
export const RateStringSchema = z
  .union([z.string(), z.number()])
  .transform((v) => (typeof v === "number" ? String(v) : v.trim()))
  .refine((v) => /^\d+(\.\d+)?$/.test(v) && Number(v) > 0, "a positive decimal rate");

export const RateTableSchema = z.object({
  /** Calendar date the provider published the table (YYYY-MM-DD). */
  asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  base: z.literal("USD"),
  rates: z.record(z.string().regex(/^[A-Z]{3}$/), RateStringSchema),
});

export type RateTable = z.infer<typeof RateTableSchema>;

export type RateSource = "bundled" | "live";

export interface RateTableWithSource extends RateTable {
  source: RateSource;
}

export class RatesError extends Error {
  override readonly name = "RatesError";
}

export { convert } from "./convert";
