import { expect, test } from "@playwright/test";
import { PDFParse } from "pdf-parse";
import { pickCombobox, signInAs } from "./helpers";

/**
 * IRN registration through the manual connector (spec §9e): a GST profile with e-invoicing
 * on, the manual connector chosen in Settings, an issued invoice, the portal's response pasted
 * on the invoice page, the status pill reads Registered and the PDF carries the IRN.
 */
test.setTimeout(300_000);

const EMAIL = "e2e@example.com";
const IRN = "b".repeat(40) + "0123456789abcdef01234567";

const b64url = (v: unknown) =>
  Buffer.from(typeof v === "string" ? v : JSON.stringify(v)).toString("base64url");
const signedQr = [
  b64url({ alg: "RS256", typ: "JWT" }),
  b64url({ data: JSON.stringify({ Irn: IRN, SellerGstin: "29ABCDE1234F1Z5" }) }),
  b64url("sig"),
].join(".");

test("pasting the IRP response registers the invoice and prints the IRN", async ({ page }) => {
  const stamp = `Irn ${Date.now().toString(36)}`;
  const profileLabel = `${stamp} profile`;
  const clientName = `${stamp} client`;
  await signInAs(page, EMAIL, "E2E Owner");

  // a GST issuer with e-invoicing on
  await page.goto("/settings/profiles/new");
  await page.locator("#label").fill(profileLabel);
  await page.locator("#legalName").fill(`${stamp} Legal Name`);
  await page.locator("#email").fill("issuer@example.com");
  await page.locator("#stateCode").selectOption("KA");
  await page.locator('[id="address.line1"]').fill("1 Test Street");
  await page.locator('[id="address.city"]').fill("Bengaluru");
  await page.locator('[id="address.postalCode"]').fill("560001");
  await page.locator("#gstin").fill("29ABCDE1234F1Z5");
  await page.locator("#panNumber").fill("ABCDE1234F");
  await page.locator("#einvoiceEnabled").check();
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page).toHaveURL(/\/settings\/profiles$/);
  await expect(page.getByRole("cell", { name: profileLabel })).toBeVisible();

  // the manual connector for that profile
  await page.goto("/settings/einvoicing");
  const card = page.locator(`[data-profile-label="${profileLabel}"]`);
  await card.locator('select[name="indiaConnector"]').selectOption("manual");
  await card.getByRole("button", { name: "Save e-invoicing settings" }).click();
  await expect(card.getByText("E-invoicing settings saved")).toBeVisible();

  // a registered client with a PIN
  await page.goto("/clients/new");
  await page.locator("#displayName").fill(clientName);
  await page.locator("#stateCode").selectOption("KA");
  await page.locator("#taxIdType").selectOption("GSTIN");
  await page.locator("#taxId").fill("29AAAAA0000A1Z5");
  await page.locator('[id="billingAddress.line1"]').fill("2 Client Road");
  await page.locator('[id="billingAddress.city"]').fill("Bengaluru");
  await page.locator('[id="billingAddress.postalCode"]').fill("560002");
  await page.getByRole("button", { name: "Save client" }).click();
  await expect(page.getByRole("heading", { name: clientName })).toBeVisible();

  // an issued invoice
  await page.goto("/invoices/new");
  await pickCombobox(page, "#issuerProfileId", profileLabel);
  await pickCombobox(page, "#clientId", clientName);
  await page.getByLabel("Line 1 description").fill("Design work");
  await page.getByLabel("Line 1 SAC/HSN").fill("998314");
  await page.getByLabel("Line 1 quantity").fill("1");
  await page.getByLabel("Line 1 rate").fill("1000");
  await page.getByRole("button", { name: "Save and issue" }).click();
  await expect(page).toHaveURL(/\/invoices\/[^/]+$/);

  // the e-invoice card: not registered, the JSON downloads, the pasted response registers
  const panel = page.locator("[data-einvoice-panel]");
  await expect(panel.getByText("Not registered")).toBeVisible();
  await expect(page.getByRole("link", { name: "Download e-invoice JSON" })).toBeVisible();
  await panel.locator("#response").fill(
    JSON.stringify({
      Irn: IRN,
      AckNo: 112010000000777,
      AckDt: "2026-04-15 10:30:00",
      SignedQRCode: signedQr,
    }),
  );
  await panel.getByRole("button", { name: "Record IRN" }).click();
  await expect(page.getByText("IRN recorded")).toBeVisible();
  await expect(page.locator("[data-einvoice-panel]").getByText("Registered")).toBeVisible();
  await expect(page.locator("[data-einvoice-panel]")).toContainText(IRN);

  // the regenerated PDF prints the IRN
  const pdf = await page.getByRole("link", { name: "Download PDF" }).getAttribute("href");
  const res = await page.request.get(pdf!);
  expect(res.status()).toBe(200);
  const parser = new PDFParse({ data: new Uint8Array(await res.body()) });
  try {
    const text = (await parser.getText()).text;
    expect(text).toContain("IRN");
    expect(text.replace(/\s+/g, "")).toContain(IRN);
  } finally {
    await parser.destroy();
  }
});
