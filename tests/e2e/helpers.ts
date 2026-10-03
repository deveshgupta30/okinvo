import { expect, type Page } from "@playwright/test";

/** The fixed password every e2e owner uses (AUTH_PASSWORD_SIGNIN=true on the server under test). */
export const E2E_PASSWORD = "correct horse battery staple";

/** True once the signed-in frame is on screen: the sidebar navigation (desktop) or the top bar's menu button (phones). */
export async function shellVisible(page: Page): Promise<boolean> {
  const nav = page.getByRole("navigation", { name: "Primary" });
  const menu = page.getByRole("button", { name: "Open menu" });
  return (await nav.isVisible()) || (await menu.isVisible());
}

/**
 * Signs `email` in through the password form: creates the account on the first run against a
 * database (the address must be an exact allow-list entry), signs in on later runs. Resolves once
 * the signed-in shell is visible.
 */
export async function signInAs(
  page: Page,
  email: string,
  name = "E2E Owner",
  opts: { completeOnboarding?: boolean } = {},
): Promise<void> {
  await page.goto("/auth/sign-in");
  const form = page.getByTestId("password-sign-in");
  await expect(async () => {
    await form.getByRole("button", { name: /First time here/ }).click();
    await expect(form.getByLabel("Name")).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 60_000 });
  await form.getByLabel("Name").fill(name);
  await form.getByLabel("Email").fill(email);
  await form.getByLabel("Password").fill(E2E_PASSWORD);
  await form.getByRole("button", { name: "Create account" }).click();
  const exists = form.getByText(/user already exists|already exists/i);
  await expect
    .poll(
      async () =>
        (await shellVisible(page)) ||
        page.url().includes("/onboarding") ||
        (await exists.isVisible()),
      { timeout: 60_000 },
    )
    .toBe(true);
  if (!(await shellVisible(page)) && !page.url().includes("/onboarding")) {
    await signInExisting(page, email);
  }
  if (opts.completeOnboarding !== false) await finishOnboardingIfShown(page, name);
  await expect
    .poll(async () => (await shellVisible(page)) || page.url().includes("/onboarding"), {
      timeout: 30_000,
    })
    .toBe(true);
}

/**
 * A brand-new account lands in the first-run wizard (spec §4.2). Specs that are not about the
 * wizard answer it with the minimum (India, INR, personal) and come back to the dashboard.
 */
export async function finishOnboardingIfShown(page: Page, name: string): Promise<void> {
  await page.waitForLoadState("domcontentloaded");
  if (!page.url().includes("/onboarding")) return;
  await waitHydrated(page);
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Country").selectOption("IN");
  await page.getByLabel("Preferred currency").selectOption("INR");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/step=2/);
  await waitHydrated(page);
  await page.getByRole("radio", { name: /Personal invoicing/ }).check();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/step=3/);
  await waitHydrated(page);
  await page.getByRole("button", { name: /Go to profiles/ }).click();
  await expect(page).toHaveURL(/settings\/profiles\/new/);
  await page.goto("/");
}

/** The existing account, through the sign-in (not sign-up) branch of the same form. */
export async function signInExisting(page: Page, email: string): Promise<void> {
  await page.goto("/auth/sign-in");
  const form = page.getByTestId("password-sign-in");
  await expect(async () => {
    await form.getByLabel("Email").fill(email);
    await form.getByLabel("Password").fill(E2E_PASSWORD);
    await form.getByRole("button", { name: "Sign in" }).click();
    // The dev server compiles "/" on first hit, which can take longer than a quick retry window.
    await expect
      .poll(async () => (await shellVisible(page)) || page.url().includes("/onboarding"), {
        timeout: 30_000,
      })
      .toBe(true);
  }).toPass({ timeout: 120_000 });
}

/** The onboarding wizard marks itself hydrated; controlled inputs ignore clicks before that. */
/**
 * Creates an issuer profile, a client and a one-line invoice through the UI and issues it; returns
 * the invoice page URL. Specs about documents reuse this instead of repeating the flow.
 */
export async function issueSimpleInvoice(page: Page, stamp: string): Promise<string> {
  const profileLabel = `${stamp} profile`;
  const clientName = `${stamp} client`;
  await page.goto("/settings/profiles/new");
  await page.locator("#label").fill(profileLabel);
  await page.locator("#legalName").fill(`${stamp} Legal Name`);
  await page.locator("#email").fill("issuer@example.com");
  await page.locator("#stateCode").selectOption("KA");
  await page.locator('[id="address.line1"]').fill("1 Test Street");
  await page.locator('[id="address.city"]').fill("Bengaluru");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page).toHaveURL(/\/settings\/profiles/);

  await page.goto("/clients/new");
  await page.locator("#displayName").fill(clientName);
  await page.locator("#stateCode").selectOption("KA");
  await page.locator('[id="billingAddress.line1"]').fill("2 Client Road");
  await page.locator('[id="billingAddress.city"]').fill("Bengaluru");
  await page.getByRole("button", { name: "Save client" }).click();
  await expect(page.getByRole("heading", { name: clientName })).toBeVisible();

  await page.goto("/invoices/new");
  await page.locator("#issuerProfileId").selectOption({ label: profileLabel });
  await page.locator("#clientId").selectOption({ label: clientName });
  await page.getByLabel("Line 1 description").fill("Shared work");
  await page.getByLabel("Line 1 quantity").fill("1");
  await page.getByLabel("Line 1 rate").fill("1000");
  await page.getByRole("button", { name: "Save and issue" }).click();
  await expect(page).toHaveURL(/\/invoices\/[^/]+$/);
  return page.url();
}

export async function waitHydrated(page: Page): Promise<void> {
  await expect(page.locator('[data-hydrated="true"]')).toBeVisible({ timeout: 60_000 });
}
