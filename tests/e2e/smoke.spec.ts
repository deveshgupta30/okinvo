import { expect, test } from "@playwright/test";

test("liveness and readiness probes", async ({ request }) => {
  const live = await request.get("/api/health/live");
  expect(live.status()).toBe(200);
  expect(await live.json()).toEqual({ ok: true });
  const ready = await request.get("/api/health/ready");
  expect(ready.status()).toBe(200);
  expect(await ready.json()).toEqual({ ok: true, db: "ok" });
});

test("sign-in page renders with security headers", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  const response = await page.goto("/auth/sign-in");
  expect(response?.headers()["content-security-policy"]).toMatch(
    /script-src 'self' 'nonce-[^']+' 'strict-dynamic'/,
  );
  expect(response?.headers()["x-content-type-options"]).toBe("nosniff");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("theme: cookie forces light, no cookie follows the OS, garbage behaves like system", async ({
  page,
  context,
}) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await context.addCookies([
    { name: "okinvo.theme", value: "light", url: "http://127.0.0.1:3000" },
  ]);
  await page.goto("/auth/sign-in");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).toBe("rgb(255, 255, 255)");

  await context.clearCookies();
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/auth/sign-in");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

  await context.addCookies([{ name: "okinvo.theme", value: "blue", url: "http://127.0.0.1:3000" }]);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/auth/sign-in");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(
    "rgb(1, 1, 2)",
  );
  expect(errors).toEqual([]);
});

test("app shell shows the primary navigation", async ({ page }) => {
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Primary" });
  await expect(nav.getByRole("link", { name: "Invoices" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Dashboard" })).toHaveAttribute(
    "aria-current",
    "page",
  );
});
