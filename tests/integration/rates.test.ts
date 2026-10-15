import "dotenv/config";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { fromDateString } from "@/lib/dates";

const url = process.env.DATABASE_URL;
if (!url && process.env.CI) throw new Error("DATABASE_URL is required when CI is set");

const liveBody = (asOf: string) =>
  JSON.stringify({
    result: "success",
    time_last_update_utc: `${asOf}T00:02:31Z`,
    base_code: "USD",
    rates: { USD: 1, INR: 90.25, EUR: 0.91 },
  });

/**
 * Addendum §5: `currentRates()` prefers today's stored snapshot, refreshes through the outbound
 * gate only when `RATES_ONLINE` is on, and otherwise serves the bundled table; a blocked host or
 * a failed request never throws.
 */
describe.skipIf(!url)("currentRates", () => {
  let prisma: typeof import("@/lib/db").prisma;
  let rates: typeof import("@/server/dal/rates");
  const today = "2031-01-15"; // far from any real snapshot another test may have stored

  beforeAll(async () => {
    process.env.FIELD_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString("base64");
    ({ prisma } = await import("@/lib/db"));
    rates = await import("@/server/dal/rates");
    await prisma.exchangeRateSnapshot.deleteMany({
      where: { asOf: { gte: fromDateString("2031-01-01") } },
    });
  });

  beforeEach(() => rates.resetRatesRefreshState());

  afterAll(async () => {
    await prisma.exchangeRateSnapshot.deleteMany({
      where: { asOf: { gte: fromDateString("2031-01-01") } },
    });
  });

  it("serves the bundled table with its own date when the instance is offline", async () => {
    const r = await rates.currentRates({ online: false, today });
    expect(r.source).toBe("bundled");
    expect(r.base).toBe("USD");
    expect(r.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Number(r.rates.INR)).toBeGreaterThan(1);
  });

  it("falls back to the bundle, without throwing, when online but the host is not allowed", async () => {
    const r = await rates.currentRates({ online: true, today, allow: [] });
    expect(r.source).toBe("bundled");
    expect(
      await prisma.exchangeRateSnapshot.count({ where: { asOf: fromDateString(today) } }),
    ).toBe(0);
  });

  it("refreshes once a day through the gate and then serves the stored snapshot", async () => {
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      return new Response(liveBody(today), { headers: { "content-type": "application/json" } });
    };
    const first = await rates.currentRates({
      online: true,
      today,
      allow: ["open.er-api.com"],
      fetch: fetchImpl,
    });
    expect(first.source).toBe("live");
    expect(first.asOf).toBe(today);
    expect(first.rates.INR).toBe("90.25");
    expect(calls).toBe(1);

    const again = await rates.currentRates({
      online: true,
      today,
      allow: ["open.er-api.com"],
      fetch: fetchImpl,
    });
    expect(again.source).toBe("live");
    expect(calls).toBe(1); // today's snapshot wins, no second request
    expect(
      await prisma.exchangeRateSnapshot.count({ where: { asOf: fromDateString(today) } }),
    ).toBe(1);

    // offline instances still see a stored snapshot for the day
    const offline = await rates.currentRates({ online: false, today });
    expect(offline.source).toBe("live");
  });

  it("keeps the last snapshot when the refresh fails, and does not retry that day", async () => {
    const tomorrow = "2031-01-16";
    let calls = 0;
    const failing = async () => {
      calls += 1;
      return new Response("nope", { status: 503 });
    };
    const r = await rates.currentRates({
      online: true,
      today: tomorrow,
      allow: ["open.er-api.com"],
      fetch: failing,
    });
    expect(r.source).toBe("live");
    expect(r.asOf).toBe(today); // yesterday's stored table, not the bundle
    expect(calls).toBe(1);

    // the spec's "first request of the day": a failed attempt is not repeated until the next day
    const again = await rates.currentRates({
      online: true,
      today: tomorrow,
      allow: ["open.er-api.com"],
      fetch: failing,
    });
    expect(again.asOf).toBe(today);
    expect(calls).toBe(1);
  });

  it("shares one in-flight refresh between concurrent first requests of a day", async () => {
    const day = "2031-01-17";
    let calls = 0;
    const slow = async () => {
      calls += 1;
      await new Promise((r) => setTimeout(r, 50));
      return new Response(liveBody(day), { headers: { "content-type": "application/json" } });
    };
    const results = await Promise.all(
      [1, 2, 3].map(() =>
        rates.currentRates({ online: true, today: day, allow: ["open.er-api.com"], fetch: slow }),
      ),
    );
    expect(results.map((r) => r.asOf)).toEqual([day, day, day]);
    expect(calls).toBe(1);
  });
});
