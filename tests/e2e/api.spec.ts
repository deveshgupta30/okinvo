import { expect, test } from "@playwright/test";
import { signInAs } from "./helpers";

/**
 * Settings → API (spec §7.1): create a key, see it once, and use it as a bearer token against an
 * API route; a revoked key is refused.
 */
test.setTimeout(300_000);

test("an API key created in Settings → API authenticates a bearer request", async ({
  page,
  request,
}) => {
  await signInAs(page, "e2e@example.com", "E2E Owner");
  await page.goto("/settings/api");
  await expect(page.getByRole("heading", { name: "API", level: 1 })).toBeVisible();
  const name = `e2e key ${Date.now().toString(36)}`;
  await page.locator("#api-key-name").fill(name);
  await page.getByRole("button", { name: "Create API key" }).click();
  const shown = page.locator("[data-api-key]");
  await expect(shown).toBeVisible();
  const key = (await shown.textContent())?.trim() ?? "";
  expect(key).toMatch(/^okv_[A-Za-z0-9_-]{43}$/);
  await expect(page.getByRole("cell", { name, exact: true })).toBeVisible();

  // a fresh request context: no session cookie, only the key
  const ok = await request.get("/api/health/status", {
    headers: { Authorization: `Bearer ${key}` },
  });
  expect([200, 503]).toContain(ok.status());
  const json = (await ok.json()) as { version: { app: string } };
  expect(json.version.app).toMatch(/^\d+\.\d+\.\d+/);
  const anon = await request.get("/api/health/status");
  expect(anon.status()).toBe(401);
  const bogus = await request.get("/api/health/status", {
    headers: { Authorization: "Bearer okv_" + "x".repeat(43) },
  });
  expect(bogus.status()).toBe(401);

  // revoke → refused
  const row = page.getByRole("row", { name: new RegExp(name) });
  await row.getByRole("button", { name: "Revoke" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Revoke" }).click();
  await expect(row.getByText("Revoked")).toBeVisible();
  const after = await request.get("/api/health/status", {
    headers: { Authorization: `Bearer ${key}` },
  });
  expect(after.status()).toBe(401);
});
