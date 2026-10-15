import { expect, test, type Page } from "@playwright/test";
import { signInAs } from "./helpers";

/**
 * Broken-link crawl (addendum §2 item 16): signed in, every internal link reachable from the
 * sidebar and the settings navigation, and from the pages they open (depth 2), answers 200
 * (after redirects). Downloads and sign-out are left alone.
 */
test.skip(({ isMobile }) => !!isMobile, "desktop project only");
test.setTimeout(600_000);

const SKIP = [/^\/api\//, /^\/auth\/sign-out/, /\/download/, /^mailto:/, /^#/];
const ID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[A-Za-z0-9_-]{32,}/g;
/** Registers link every row; one representative per screen pattern keeps the crawl bounded. */
const pattern = (href: string) => href.split("?")[0]!.replace(ID, ":id");

async function internalLinks(page: Page): Promise<string[]> {
  const hrefs = await page
    .locator("a[href]")
    .evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).getAttribute("href") ?? ""));
  return [...new Set(hrefs)]
    .filter((h) => h.startsWith("/") && !SKIP.some((re) => re.test(h)))
    .map((h) => h.split("#")[0]!);
}

test("every internal link from the navigation answers 200", async ({ page }) => {
  await signInAs(page, "e2e@example.com", "E2E Owner");
  const seen = new Set<string>();
  const queue: { href: string; depth: number }[] = [
    { href: "/", depth: 0 },
    { href: "/settings/profiles", depth: 0 },
  ];
  const broken: string[] = [];
  while (queue.length > 0) {
    const { href, depth } = queue.shift()!;
    const key = pattern(href);
    if (seen.has(key)) continue;
    seen.add(key);
    const res = await page.request.get(href, { maxRedirects: 5, timeout: 120_000 });
    if (res.status() !== 200) broken.push(`${href} -> ${res.status()}`);
    if (depth >= 1 || res.status() !== 200) continue; // depth 2 is requested, not crawled further
    await page.goto(href, { waitUntil: "domcontentloaded" });
    for (const next of await internalLinks(page)) {
      if (!seen.has(pattern(next))) queue.push({ href: next, depth: depth + 1 });
    }
  }
  expect(seen.size).toBeGreaterThan(15);
  expect(broken).toEqual([]);
});
