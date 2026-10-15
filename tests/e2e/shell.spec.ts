import { expect, test } from "@playwright/test";
import { signInAs } from "./helpers";

test.setTimeout(300_000);

const EMAIL = "smoke@example.com";

// The sidebar only exists from md up; the phone project covers the drawer instead.
const desktopOnly = (isMobile: boolean | undefined) =>
  test.skip(!!isMobile, "desktop sidebar only");

test("sidebar collapses to a rail, persists across reload, and expands again", async ({
  page,
  isMobile,
}) => {
  desktopOnly(isMobile);
  await signInAs(page, EMAIL, "Smoke Owner");
  const aside = page.locator("aside[data-sidebar]");
  await expect(aside).toHaveAttribute("data-sidebar", "expanded");
  await expect(
    page.getByRole("navigation", { name: "Primary" }).getByText("Invoices"),
  ).toBeVisible();

  // A click before hydration does nothing on a cold dev route: retry until the state flips.
  await expect(async () => {
    await page.getByRole("button", { name: "Collapse sidebar" }).click();
    await expect(aside).toHaveAttribute("data-sidebar", "collapsed", { timeout: 2_000 });
  }).toPass({ timeout: 60_000 });
  const width = async () => (await aside.boundingBox())?.width ?? 0;
  await expect.poll(width).toBeLessThan(80);
  // labels are hidden on the rail but still announced
  await expect(
    page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Invoices" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Expand sidebar" })).toBeVisible();

  await page.reload();
  await expect(page.locator("aside[data-sidebar]")).toHaveAttribute("data-sidebar", "collapsed");
  await expect(async () => {
    await page.getByRole("button", { name: "Expand sidebar" }).click();
    await expect(page.locator("aside[data-sidebar]")).toHaveAttribute("data-sidebar", "expanded", {
      timeout: 2_000,
    });
  }).toPass({ timeout: 60_000 });
});

test("footer order: theme toggle, Settings, user menu with Profile and Log out", async ({
  page,
  isMobile,
}) => {
  desktopOnly(isMobile);
  await signInAs(page, EMAIL, "Smoke Owner");
  const aside = page.locator("aside[data-sidebar]");
  const theme = aside.getByRole("radiogroup", { name: "Theme" });
  const settings = aside.getByRole("link", { name: "Settings" });
  const menuButton = aside.getByRole("button", { name: /Account menu/ });
  const y = async (l: typeof theme) => (await l.boundingBox())?.y ?? -1;
  expect(await y(theme)).toBeLessThan(await y(settings));
  expect(await y(settings)).toBeLessThan(await y(menuButton));

  // Start from a dark OS so "Light" is an observable change, and retry the click past hydration.
  await page.emulateMedia({ colorScheme: "dark" });
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(async () => {
    await theme.getByRole("radio", { name: "Light" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light", { timeout: 2_000 });
  }).toPass({ timeout: 60_000 });
  await expect
    .poll(
      async () => (await page.context().cookies()).find((c) => c.name === "okinvo.theme")?.value,
    )
    .toBe("light");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(async () => {
    await aside.getByRole("radio", { name: "System" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark", { timeout: 2_000 });
  }).toPass({ timeout: 60_000 });

  await settings.click();
  await expect(page).toHaveURL(/\/settings\/profiles$/);

  await menuButton.click();
  const menu = page.getByRole("menu");
  await expect(menu.getByRole("menuitem", { name: "Profile" })).toBeVisible();
  await menu.getByRole("menuitem", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/auth\/sign-in$/);
});

test("a flash shows as a toast that dismisses itself, in both themes", async ({
  page,
  isMobile,
}) => {
  desktopOnly(isMobile);
  await signInAs(page, EMAIL, "Smoke Owner");
  const origin = `http://127.0.0.1:${process.env.E2E_PORT ?? "3000"}`;
  for (const theme of ["dark", "light"] as const) {
    await page.context().addCookies([{ name: "okinvo.theme", value: theme, url: origin }]);
    const flash = encodeURIComponent(
      JSON.stringify({ kind: "success", message: `Saved in ${theme}` }),
    );
    await page.goto(`/settings/account?flash=${flash}`);
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    const toast = page.locator("[data-flash-stack]").getByText(`Saved in ${theme}`).first();
    await expect(toast).toBeVisible();
    // the parameter is gone, so a reload does not repeat the message
    await expect(page).not.toHaveURL(/flash=/);
    await expect(toast).toBeHidden({ timeout: 10_000 });
  }
});

test("mobile: the top bar's menu opens a drawer that navigates and closes", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signInAs(page, EMAIL, "Smoke Owner");
  await expect(page.locator("aside[data-sidebar]")).toBeHidden();
  const drawer = page.getByRole("dialog", { name: "Navigation" });
  await expect(async () => {
    await page.getByRole("button", { name: "Open menu" }).click();
    await expect(drawer).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 60_000 });
  await drawer.getByRole("link", { name: "Invoices" }).click();
  await expect(page).toHaveURL(/\/invoices$/);
  await expect(drawer).toBeHidden();
});

test("dashboard greets by first name; Appearance switches the accent and it persists", async ({
  page,
  isMobile,
}) => {
  desktopOnly(isMobile);
  await signInAs(page, EMAIL, "Smoke Owner");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^Hi, \S+/);

  await page.goto("/settings/appearance");
  const swatches = page.getByRole("radiogroup", { name: /Accent colou?r/ });
  await expect(async () => {
    await swatches.getByRole("radio", { name: "Rose" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-accent", "rose", { timeout: 2_000 });
  }).toPass({ timeout: 60_000 });
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-accent", "rose");
  // back to the default so other runs start from mint
  await expect(async () => {
    await swatches.getByRole("radio", { name: "Mint" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-accent", "mint", { timeout: 2_000 });
  }).toPass({ timeout: 60_000 });
});
