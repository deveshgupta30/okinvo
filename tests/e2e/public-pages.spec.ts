import { expect, test } from "@playwright/test";

/**
 * Sitemap and robots (addendum §2 item 9): crawlers are kept out of the signed-in app, the
 * share viewer, the verification page and the API, and are pointed at the public pages.
 */
test.skip(({ isMobile }) => !!isMobile, "desktop project only");

test("robots.txt disallows the private routes and names the sitemap", async ({ request }) => {
  const res = await request.get("/robots.txt");
  expect(res.status()).toBe(200);
  const text = await res.text();
  for (const p of ["/i/", "/verify/", "/api/", "/settings", "/invoices", "/clients"]) {
    expect(text).toContain(`Disallow: ${p}`);
  }
  expect(text).toMatch(/Sitemap: https?:\/\/.+\/sitemap\.xml/);
});

test("sitemap.xml lists the public pages only", async ({ request }) => {
  const res = await request.get("/sitemap.xml");
  expect(res.status()).toBe(200);
  const xml = await res.text();
  expect(xml).toContain("/legal/privacy</loc>");
  expect(xml).toContain("/auth/sign-in</loc>");
  expect(xml).not.toContain("/invoices");
  expect(xml).not.toContain("/settings");
});
