import { z } from "zod";
import { minorUnits } from "@/lib/money";
import { RateStringSchema, RateTableSchema, type RateTable } from "./index";

export type { RateTable };

/** The one provider (addendum §5): free, keyless, USD base, updated once a day. */
export const RATES_HOST = "open.er-api.com";
export const RATES_URL = `https://${RATES_HOST}/v6/latest/USD`;

const LiveSchema = z.object({
  result: z.literal("success"),
  /** "Thu, 15 Oct 2026 00:02:31 +0000" */
  time_last_update_utc: z.string(),
  base_code: z.literal("USD"),
  rates: z.record(z.string(), z.union([z.number(), z.string()])),
});

/** True for the codes the app accepts as invoice currencies (0 or 2 minor units, ISO 4217). */
function supported(code: string): boolean {
  if (!/^[A-Z]{3}$/.test(code)) return false;
  try {
    const units = minorUnits(code);
    return units === 0 || units === 2;
  } catch {
    return false;
  }
}

/** The provider's payload → the app's table: date only, supported currencies, decimal strings. */
export function parseLiveRates(payload: unknown): RateTable {
  const live = LiveSchema.parse(payload);
  const published = new Date(live.time_last_update_utc);
  if (Number.isNaN(published.getTime())) throw new Error("rates: unreadable publication date");
  const rates: Record<string, string> = {};
  for (const [code, value] of Object.entries(live.rates)) {
    if (!supported(code)) continue;
    const parsed = RateStringSchema.safeParse(value);
    if (parsed.success) rates[code] = parsed.data;
  }
  rates.USD = "1";
  return RateTableSchema.parse({
    asOf: published.toISOString().slice(0, 10),
    base: "USD",
    rates: Object.fromEntries(Object.entries(rates).sort(([a], [b]) => a.localeCompare(b))),
  });
}
