import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fromDateString, toDateString, todayIn, type DateString } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { createOutboundFetch, parseAllowList, type FetchLike } from "@/lib/net/outbound";
import { RateTableSchema, type RateTable, type RateTableWithSource } from "@/lib/rates";
import { parseLiveRates, RATES_HOST, RATES_URL } from "@/lib/rates/live";

export interface RatesOptions {
  /** `RATES_ONLINE`: refresh through the outbound gate once a day. */
  online?: boolean;
  /** `OUTBOUND_ALLOW` host names; the gate refuses the provider unless it is listed. */
  allow?: readonly string[];
  fetch?: FetchLike;
  /** The calendar day a refresh is keyed by (UTC); tests pin it. */
  today?: DateString;
}

let bundled: RateTable | undefined;
/** The UTC day a refresh was last attempted (success or not) and the request in flight for it. */
let attemptedDay: DateString | undefined;
let inFlight: Promise<RateTableWithSource | null> | undefined;

/** Test seam: forget the day marker so a suite can replay "first request of the day". */
export function resetRatesRefreshState(): void {
  attemptedDay = undefined;
  inFlight = undefined;
}

/** `data/exchange-rates.json`, read once per process: the image always ships one. */
export function bundledRates(): RateTable {
  if (!bundled) {
    const file = path.join(process.cwd(), "data", "exchange-rates.json");
    bundled = RateTableSchema.parse(JSON.parse(readFileSync(file, "utf8")));
  }
  return bundled;
}

function fromRow(row: { asOf: Date; base: string; rates: unknown }): RateTableWithSource {
  const table = RateTableSchema.parse({
    asOf: toDateString(row.asOf),
    base: row.base,
    rates: row.rates,
  });
  return { ...table, source: "live" };
}

async function latestSnapshot(): Promise<RateTableWithSource | null> {
  const row = await prisma.exchangeRateSnapshot.findFirst({ orderBy: { asOf: "desc" } });
  return row ? fromRow(row) : null;
}

/** One request through the gate; any failure (blocked, timeout, bad payload) yields null. */
async function refresh(o: RatesOptions): Promise<RateTableWithSource | null> {
  try {
    const { env } = await import("@/lib/env");
    const allow = o.allow ?? parseAllowList(env.OUTBOUND_ALLOW);
    const fetchOut = createOutboundFetch({
      allow,
      ...(o.fetch ? { fetch: o.fetch } : {}),
    });
    const res = await fetchOut(RATES_URL);
    if (!res.ok) return null;
    const table = parseLiveRates(await res.json());
    const asOf = fromDateString(table.asOf);
    const row = await prisma.exchangeRateSnapshot.upsert({
      where: { asOf },
      create: {
        asOf,
        base: table.base,
        rates: table.rates,
        source: RATES_HOST,
      },
      update: { rates: table.rates, source: RATES_HOST },
    });
    return fromRow(row);
  } catch {
    return null;
  }
}

/** One attempt per UTC day per process, shared by concurrent first requests (review finding 4). */
function refreshOnce(o: RatesOptions, today: DateString): Promise<RateTableWithSource | null> {
  if (attemptedDay === today) return inFlight ?? Promise.resolve(null);
  attemptedDay = today;
  inFlight = refresh(o).finally(() => {
    inFlight = undefined;
  });
  return inFlight;
}

/**
 * The table the app converts with (addendum §5): today's stored snapshot if there is one; else,
 * when the instance is online, one refresh attempt for the day (a failure is not retried until
 * the next day, so an unreachable provider costs one timeout, not one per request; never on a
 * document's request path, the callers are the converter page and the dashboard); else the
 * newest stored snapshot; else the bundle. Never throws for network reasons.
 */
export async function currentRates(o: RatesOptions = {}): Promise<RateTableWithSource> {
  const today = o.today ?? todayIn("UTC");
  const stored = await latestSnapshot();
  if (stored && stored.asOf === today) return stored;
  const online = o.online ?? (await import("@/lib/env")).env.RATES_ONLINE;
  if (online) {
    const fresh = await refreshOnce({ ...o, today }, today);
    if (fresh) return fresh;
  }
  if (stored) return stored;
  return { ...bundledRates(), source: "bundled" };
}
