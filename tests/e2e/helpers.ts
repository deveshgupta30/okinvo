import { expect, type Page } from "@playwright/test";

/** The fixed password every e2e owner uses (AUTH_PASSWORD_SIGNIN=true on the server under test). */
export const E2E_PASSWORD = "correct horse battery staple";

/**
 * Signs `email` in through the password form: creates the account on the first run against a
 * database (the address must be an exact allow-list entry), signs in on later runs. Resolves once
 * the signed-in shell's primary navigation is visible.
 */
export async function signInAs(page: Page, email: string, name = "E2E Owner"): Promise<void> {
  await page.goto("/auth/sign-in");
  const form = page.getByTestId("password-sign-in");
  const shell = page.getByRole("navigation", { name: "Primary" });
  await expect(async () => {
    await form.getByRole("button", { name: /First time here/ }).click();
    await expect(form.getByLabel("Name")).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 60_000 });
  await form.getByLabel("Name").fill(name);
  await form.getByLabel("Email").fill(email);
  await form.getByLabel("Password").fill(E2E_PASSWORD);
  await form.getByRole("button", { name: "Create account" }).click();
  const exists = form.getByText(/user already exists|already exists/i);
  await expect(shell.or(exists).first()).toBeVisible({ timeout: 30_000 });
  if (!(await shell.isVisible())) await signInExisting(page, email);
  await expect(shell).toBeVisible();
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
    await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible({
      timeout: 30_000,
    });
  }).toPass({ timeout: 120_000 });
}
