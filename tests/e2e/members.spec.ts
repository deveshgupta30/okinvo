import { expect, test, type Browser } from "@playwright/test";
import { E2E_PASSWORD, finishOnboardingIfShown, signInAs } from "./helpers";

/**
 * Members (spec §9b): the owner invites a viewer through Settings → Users; the viewer signs up
 * with the invited address (which is NOT on the env allow-list), is read-only and gets 403 on
 * settings. The viewer account persists between runs, so later runs only prove the gating.
 */
test.setTimeout(300_000);

const OWNER = "smoke@example.com";
const VIEWER = "e2e-viewer@example.com";

async function viewerSession(browser: Browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/auth/sign-in");
  const form = page.getByTestId("password-sign-in");
  await expect(async () => {
    await form.getByRole("button", { name: /First time here/ }).click();
    await expect(form.getByLabel("Name")).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 60_000 });
  await form.getByLabel("Name").fill("Invited Viewer");
  await form.getByLabel("Email").fill(VIEWER);
  await form.getByLabel("Password").fill(E2E_PASSWORD);
  await form.getByRole("button", { name: "Create account" }).click();
  const exists = form.getByText(/already exists/i);
  await expect
    .poll(
      async () =>
        page.url().includes("/onboarding") ||
        (await page.getByRole("button", { name: "Open menu" }).isVisible()) ||
        (await page.getByRole("navigation", { name: "Primary" }).isVisible()) ||
        (await exists.isVisible()),
      { timeout: 60_000 },
    )
    .toBe(true);
  if (await exists.isVisible()) {
    await page.goto("/auth/sign-in");
    await expect(async () => {
      await form.getByLabel("Email").fill(VIEWER);
      await form.getByLabel("Password").fill(E2E_PASSWORD);
      await form.getByRole("button", { name: "Sign in" }).click();
      await expect
        .poll(async () => page.url().includes("/onboarding") || page.url().endsWith("/"), {
          timeout: 30_000,
        })
        .toBe(true);
    }).toPass({ timeout: 120_000 });
  }
  await finishOnboardingIfShown(page, "Invited Viewer");
  return { context, page };
}

test("owner invites a viewer; the viewer is read-only and cannot open settings", async ({
  page,
  browser,
  isMobile,
}) => {
  test.skip(!!isMobile, "two browser contexts; desktop only");
  await signInAs(page, OWNER, "Smoke Owner");
  await page.goto("/settings/users");
  await expect(page.getByRole("heading", { name: "Users", level: 1 })).toBeVisible();
  // Invite (idempotent: re-inviting an address that already has an account is refused, which is fine)
  const alreadyMember = (await page.getByText(VIEWER).count()) > 0;
  if (!alreadyMember) {
    await page.locator("#inviteEmail").fill(VIEWER);
    await page.locator("#inviteRole").selectOption("VIEWER");
    await page.getByRole("button", { name: "Invite" }).click();
    await expect(page.getByRole("status")).toContainText(VIEWER);
    await expect(page.getByRole("status")).toContainText("/auth/sign-in");
  }

  const viewer = await viewerSession(browser);
  try {
    await viewer.page.goto("/");
    await expect(viewer.page.getByRole("heading", { level: 1 })).toHaveText(/^Hi, /);
    const res = await viewer.page.goto("/settings/profiles");
    expect(res?.status()).toBe(403);
    await expect(viewer.page.getByText(/403|cannot do that/i).first()).toBeVisible();
    const res2 = await viewer.page.goto("/invoices/new");
    expect(res2?.status()).toBe(403);
  } finally {
    await viewer.context.close();
  }

  // The owner sees the viewer listed with the Viewer role.
  await page.goto("/settings/users");
  const row = page.getByRole("row").filter({ hasText: VIEWER });
  await expect(row.getByLabel(`Role of ${VIEWER}`)).toHaveValue("VIEWER");
});
