import { expect, test } from "@playwright/test";
import { signInAs } from "./helpers";

/**
 * Performance budgets (addendum §2 item 12) against the production build only (E2E_PROD=1 in
 * CI, where the server is `pnpm build && pnpm start`): DOMContentLoaded under 2.5 s and no
 * single asset over 300 KB on the dashboard and the invoice register.
 */
test.skip(!process.env.E2E_PROD, "production build only (E2E_PROD=1)");
test.skip(({ isMobile }) => !!isMobile, "desktop project only");
test.setTimeout(300_000);

const BUDGET_MS = 2_500;
const MAX_ASSET_BYTES = 300 * 1024;

test("dashboard and invoice register stay within the budgets", async ({ page }) => {
  await signInAs(page, "e2e@example.com", "E2E Owner");
  for (const path of ["/", "/invoices"]) {
    const oversized: string[] = [];
    page.on("response", async (res) => {
      const url = res.url();
      if (!/\/_next\/static\/|\/fonts\//.test(url)) return;
      const length = Number(res.headers()["content-length"] ?? 0);
      const size = length || (await res.body().catch(() => Buffer.alloc(0))).byteLength;
      if (size > MAX_ASSET_BYTES) oversized.push(`${url} (${size} bytes)`);
    });
    await page.goto(path, { waitUntil: "load" });
    const dcl = await page.evaluate(() => {
      const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
      return nav.domContentLoadedEventEnd - nav.startTime;
    });
    expect(dcl, `${path} DOMContentLoaded`).toBeLessThan(BUDGET_MS);
    expect(oversized, `${path} assets over ${MAX_ASSET_BYTES} bytes`).toEqual([]);
    page.removeAllListeners("response");
  }
});
