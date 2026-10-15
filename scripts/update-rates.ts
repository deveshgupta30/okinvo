/**
 * Refresh the bundled exchange-rate snapshot (addendum §5) on a connected machine:
 *
 *   pnpm vendor:update rates        (or: pnpm tsx scripts/update-rates.ts)
 *
 * Fetches https://open.er-api.com/v6/latest/USD (no key) through the same outbound gate the
 * server uses, keeps the currencies the app accepts (ISO 4217, 0 or 2 minor units), and writes
 * `data/exchange-rates.json` as `{ asOf, base: "USD", rates: { INR: "88.5", ... } }`. Commit the
 * result; the image always carries one, so an air-gapped instance converts without the network.
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { createOutboundFetch } from "../src/lib/net/outbound";
import { parseLiveRates, RATES_URL, RATES_HOST, type RateTable } from "../src/lib/rates/live";

async function main(): Promise<void> {
  const fetchOut = createOutboundFetch({ allow: [RATES_HOST], timeoutMs: 15_000 });
  const res = await fetchOut(RATES_URL);
  if (!res.ok) throw new Error(`${RATES_URL} answered ${res.status}`);
  const table: RateTable = parseLiveRates(await res.json());
  const file = path.join(process.cwd(), "data", "exchange-rates.json");
  writeFileSync(file, `${JSON.stringify(table, null, 2)}\n`);
  console.log(
    `rates: wrote ${Object.keys(table.rates).length} currencies as of ${table.asOf} to data/exchange-rates.json`,
  );
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
