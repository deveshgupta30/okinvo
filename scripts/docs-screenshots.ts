/**
 * Generates the documentation screenshots (docs/wiki/assets/<page>-<theme>.png, plus
 * <page>-<theme>-mobile.png for the phone layouts) against a running dev server with the demo
 * data from scripts/demo-seed.ts, in both themes, at 1440 px and 390 px:
 *
 *   pnpm dev                                   # with AUTH_PASSWORD_SIGNIN=true
 *   pnpm docs:screenshots [--only dashboard,invoice] [--theme dark]
 *
 * DOCS_APP_URL overrides the server origin (default http://127.0.0.1:3000). Point both the dev
 * server and this script at a database of their own (DATABASE_URL) so test rows never show up
 * in the pictures. The script is run by hand before a release of the docs, never in CI: the
 * images are committed.
 */
import "dotenv/config";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "@playwright/test";
import {
  DEMO_EMAIL,
  DEMO_ONBOARDING_EMAIL,
  DEMO_PASSWORD,
  seedDemo,
  type DemoIds,
} from "./demo-seed";

const ORIGIN = (process.env["DOCS_APP_URL"] ?? "http://127.0.0.1:3000").replace(/\/+$/, "");
const OUT = path.resolve(import.meta.dirname, "..", "docs", "wiki", "assets");
const THEMES = ["dark", "light"] as const;
type Theme = (typeof THEMES)[number];

const args = process.argv.slice(2);
const only = new Set(
  (args.includes("--only") ? (args[args.indexOf("--only") + 1] ?? "") : "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
);
const themes = args.includes("--theme")
  ? THEMES.filter((t) => t === args[args.indexOf("--theme") + 1])
  : [...THEMES];

const SETTINGS_TABS = [
  "profiles",
  "payment-methods",
  "templates",
  "email",
  "security",
  "users",
  "data",
  "legal",
  "einvoicing",
  "account",
  "appearance",
  "api",
  "status",
];

function wanted(name: string): boolean {
  return only.size === 0 || only.has(name);
}

async function settle(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle", { timeout: 120_000 }).catch(() => {});
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
}

async function shoot(page: Page, name: string, theme: Theme, mobile = false): Promise<void> {
  const file = path.join(OUT, `${name}-${theme}${mobile ? "-mobile" : ""}.png`);
  await settle(page);
  // the Next.js dev-tools badge is not part of the app
  await page.evaluate(() => document.querySelector("nextjs-portal")?.remove());
  await page.screenshot({ path: file, type: "png", animations: "disabled", caret: "hide" });
  console.log(`  ${path.relative(process.cwd(), file)}`);
}

async function newContext(
  browser: Browser,
  theme: Theme,
  mobile: boolean,
): Promise<BrowserContext> {
  const context = await browser.newContext({
    baseURL: ORIGIN,
    colorScheme: theme,
    locale: "en-US",
    timezoneId: "Asia/Kolkata",
    deviceScaleFactor: 1,
    ...(mobile
      ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }
      : { viewport: { width: 1440, height: 900 } }),
  });
  await context.addCookies([
    { name: "okinvo.cookie-notice", value: "1", url: ORIGIN },
    { name: "okinvo.theme", value: theme, url: ORIGIN },
  ]);
  return context;
}

async function signIn(page: Page, email: string): Promise<void> {
  await page.goto("/auth/sign-in", { waitUntil: "domcontentloaded" });
  const form = page.getByTestId("password-sign-in");
  await form.getByLabel("Email").fill(email);
  await form.getByLabel("Password").fill(DEMO_PASSWORD);
  await form.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/auth/"), { timeout: 120_000 });
}

async function open(page: Page, url: string): Promise<void> {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.getByRole("heading", { level: 1 }).first().waitFor({ timeout: 120_000 });
}

async function desktop(browser: Browser, theme: Theme, ids: DemoIds): Promise<void> {
  const context = await newContext(browser, theme, false);
  const page = await context.newPage();
  await signIn(page, DEMO_EMAIL);

  const simple: [string, string][] = [
    ["dashboard", "/"],
    ["invoices", "/invoices"],
    ["builder", `/invoices/${ids.draftInvoiceId}/edit`],
    ["invoice", `/invoices/${ids.invoiceId}`],
    ["payments", `/invoices/${ids.invoiceId}/payments`],
    ["send", `/invoices/${ids.invoiceId}/send`],
    ["credit-notes", "/credit-notes"],
    ["credit-note", `/credit-notes/${ids.creditNoteId}`],
    ["clients", "/clients"],
    ["client", `/clients/${ids.clientId}`],
    ["services", "/services"],
    ["products", "/products"],
    ...SETTINGS_TABS.map((t): [string, string] => [`settings-${t}`, `/settings/${t}`]),
    ["template-editor", `/settings/profiles/${ids.profileId}/template`],
  ];
  for (const [name, url] of simple) {
    if (!wanted(name)) continue;
    await open(page, url);
    if (name === "builder") await page.locator("[data-document-preview]").first().waitFor();
    await shoot(page, name, theme);
  }

  if (wanted("share")) {
    await open(page, `/invoices/${ids.invoiceId}`);
    await page.getByRole("button", { name: "Share" }).click();
    await page.getByRole("dialog").waitFor();
    await shoot(page, "share", theme);
    await page.keyboard.press("Escape");
  }
  await context.close();

  // Public pages and the first-run wizard: fresh sessions.
  if (wanted("share-viewer") || wanted("sign-in")) {
    const fresh = await newContext(browser, theme, false);
    const view = await fresh.newPage();
    if (wanted("share-viewer")) {
      const token = ids.shareUrl.split("/i/")[1]!;
      await open(view, `/i/${token}`);
      await view.locator("[data-document-preview]").first().waitFor({ timeout: 120_000 });
      await shoot(view, "share-viewer", theme);
    }
    if (wanted("sign-in")) {
      await view.goto("/auth/sign-in", { waitUntil: "domcontentloaded" });
      await view.getByTestId("password-sign-in").waitFor();
      await shoot(view, "sign-in", theme);
    }
    await fresh.close();
  }
  if (wanted("onboarding")) {
    const fresh = await newContext(browser, theme, false);
    const wizard = await fresh.newPage();
    await signIn(wizard, DEMO_ONBOARDING_EMAIL);
    await wizard.waitForURL(/\/onboarding/, { timeout: 120_000 });
    await wizard.locator('[data-hydrated="true"]').waitFor({ timeout: 120_000 });
    await shoot(wizard, "onboarding", theme);
    await fresh.close();
  }
}

async function mobile(browser: Browser, theme: Theme, ids: DemoIds): Promise<void> {
  const context = await newContext(browser, theme, true);
  const page = await context.newPage();
  await signIn(page, DEMO_EMAIL);
  const pages: [string, string][] = [
    ["dashboard", "/"],
    ["invoices", "/invoices"],
    ["invoice", `/invoices/${ids.invoiceId}`],
    ["builder", `/invoices/${ids.draftInvoiceId}/edit`],
  ];
  for (const [name, url] of pages) {
    if (!wanted(name)) continue;
    await open(page, url);
    await shoot(page, name, theme, true);
  }
  if (wanted("drawer")) {
    await open(page, "/");
    await page.getByRole("button", { name: "Open menu" }).click();
    await page.getByRole("navigation", { name: "Primary" }).waitFor();
    await shoot(page, "drawer", theme, true);
  }
  await context.close();
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  console.log(`seeding demo data for ${ORIGIN}`);
  const ids = await seedDemo();
  const browser = await chromium.launch();
  try {
    for (const theme of themes) {
      console.log(`theme ${theme}`);
      await desktop(browser, theme, ids);
      await mobile(browser, theme, ids);
    }
  } finally {
    await browser.close();
  }
}

main()
  .then(() => process.exit(0))
  .catch((e: unknown) => {
    console.error(e);
    process.exit(1);
  });
