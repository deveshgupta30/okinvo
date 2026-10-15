import { expect, test } from "@playwright/test";

/**
 * Cookie notice and policy (spec §6.3): the notice shows on first visit, "Got it" remembers the
 * dismissal across reloads, and the public policy page lists the same cookies the app declares.
 */
test("the cookie notice shows once and the policy page lists every cookie", async ({ page }) => {
  await page.goto("/auth/sign-in");
  const notice = page.locator("[data-cookie-notice]");
  await expect(notice).toBeVisible();
  await expect(notice).toContainText(/strictly necessary/);
  await notice.getByRole("button", { name: "Got it" }).click();
  await expect(notice).toBeHidden();
  await page.reload();
  await expect(page.locator("[data-cookie-notice]")).toHaveCount(0);
  const cookies = await page.context().cookies();
  const seen = cookies.find((c) => c.name === "okinvo.cookie-notice");
  expect(seen?.value).toBe("1");
  expect(seen?.sameSite).toBe("Lax");

  await page.goto("/legal/cookies");
  await expect(page.getByRole("heading", { name: "Cookie policy" })).toBeVisible();
  for (const name of [
    "better-auth.session_token",
    "okinvo.theme",
    "okinvo.accent",
    "okinvo.cookie-notice",
  ]) {
    await expect(page.getByRole("cell", { name, exact: true })).toBeVisible();
  }
  await expect(page.getByText(/No analytics, no tracking|no analytics/i).first()).toBeVisible();
});
