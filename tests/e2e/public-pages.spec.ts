import { expect, test } from "@playwright/test";
import { signInAs } from "./helpers";

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

test("an unknown address renders the 404 block with a way back to the dashboard", async ({
  page,
}) => {
  // Anonymous visitors are sent to sign-in for any private-looking path; signed in, it is a 404.
  await signInAs(page, "smoke@example.com", "Smoke Owner");
  const res = await page.goto("/no-such-page");
  expect(res?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "404" })).toBeVisible();
  await expect(page.getByText("There is nothing at this address")).toBeVisible();
  await expect(page.getByRole("link", { name: "Go to the dashboard" })).toHaveAttribute(
    "href",
    "/",
  );
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
