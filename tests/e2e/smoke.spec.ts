import { expect, test, type Page } from "@playwright/test";

const bodyBackground = (page: Page) =>
  page.evaluate(() => getComputedStyle(document.body).backgroundColor);

test("liveness and readiness probes", async ({ request }) => {
  const live = await request.get("/api/health/live");
  expect(live.status()).toBe(200);
  expect(await live.json()).toEqual({ ok: true });
  // Readiness may legitimately be 503 for a moment after a cold start (dev: first Prisma
  // engine load); it must become — and stay — 200 with the database reported ok.
  await expect
    .poll(async () => (await request.get("/api/health/ready")).status(), { timeout: 15_000 })
    .toBe(200);
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

test("theme: explicit cookies win over the OS, no cookie and garbage follow the OS", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const cookie = (value: string) => ({ name: "okinvo.theme", value, url: "http://127.0.0.1:3000" });

  // explicit light beats a dark OS
  await page.emulateMedia({ colorScheme: "dark" });
  await context.addCookies([cookie("light")]);
  await page.goto("/auth/sign-in");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  expect(await bodyBackground(page)).toBe("rgb(255, 255, 255)");

  // explicit dark beats a light OS
  await context.clearCookies();
  await page.emulateMedia({ colorScheme: "light" });
  await context.addCookies([cookie("dark")]);
  await page.goto("/auth/sign-in");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(await bodyBackground(page)).toBe("rgb(1, 1, 2)");

  // no cookie follows the OS (light here), and a garbage cookie behaves the same way
  await context.clearCookies();
  await page.goto("/auth/sign-in");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await context.addCookies([cookie("blue")]);
  await page.goto("/auth/sign-in");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  expect(await bodyBackground(page)).toBe("rgb(255, 255, 255)");

  // …and with a dark OS the same garbage cookie resolves dark
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/auth/sign-in");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(errors).toEqual([]);
});

test("anonymous visitors are sent to sign-in; the shell shows the primary navigation after", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/auth\/sign-in$/);

  // Password sign-up of a fresh allow-listed owner (AUTH_PASSWORD_SIGNIN=true, *@example.com).
  const form = page.getByTestId("password-sign-in");
  await expect(async () => {
    await form.getByRole("button", { name: /First time here/ }).click();
    await expect(form.getByLabel("Name")).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 60_000 });
  await form.getByLabel("Name").fill("Smoke Owner");
  await form.getByLabel("Email").fill(`smoke-${Date.now()}@example.com`);
  await form.getByLabel("Password").fill("correct horse battery staple");
  await form.getByRole("button", { name: "Create account" }).click();

  const nav = page.getByRole("navigation", { name: "Primary" });
  await expect(nav.getByRole("link", { name: "Invoices" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Dashboard" })).toHaveAttribute(
    "aria-current",
    "page",
  );
});

test("no CSP violations and the client hydrates under the served policy", async ({ page }) => {
  test.skip(
    !process.env.CI,
    "Guards the production CSP; Turbopack's cold first compile in dev makes hydration timing meaningless here. Run with CI=1.",
  );
  const consoleViolations: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && /Content Security Policy/i.test(message.text())) {
      consoleViolations.push(message.text());
    }
  });
  await page.addInitScript(() => {
    const w = window as unknown as { __csp: string[] };
    w.__csp = [];
    window.addEventListener("securitypolicyviolation", (e) => {
      w.__csp.push(`${e.violatedDirective} ${e.blockedURI}`);
    });
  });
  await page.goto("/auth/sign-in");
  // React attaches __reactFiber$… to DOM nodes only once hydration has run: proof that the
  // app's scripts executed under the served CSP rather than being blocked. The sign-in form is a
  // client component, so its node carries the key once hydrated. The generous timeout covers
  // Turbopack's first client compile in dev; production hydrates in well under 1 s.
  await expect
    .poll(
      () =>
        page.evaluate(() =>
          Object.keys(document.querySelector("[data-testid=password-sign-in]") ?? {}).some((k) =>
            k.startsWith("__reactFiber"),
          ),
        ),
      { timeout: 30_000 },
    )
    .toBe(true);
  expect(await page.evaluate(() => (window as unknown as { __csp: string[] }).__csp)).toEqual([]);
  expect(consoleViolations).toEqual([]);
});
