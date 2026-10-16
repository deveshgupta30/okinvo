# Addendum (2026-10-03): air-gapped operation, launch checklist, beui components, payment checkpoints, currency rates

Extends `2026-10-02-v1-core-onboarding-ui-mcp-design.md` with the owner's requests of 2026-10-03.
Decisions the owner did not spell out are marked **(assumption)** and listed again in §6.

## 1. Sub-project L - Air-gapped operation and vendored resources

**Goal.** The deployed image works with no outbound network at all. Nothing at runtime loads a
font, script, style, image or data from the internet; every resource ships inside the image.

- **Fonts.** UI fonts (`@fontsource-variable/inter`, `@fontsource/jetbrains-mono`) and the
  document catalogue (`public/fonts`, 100 families) are vendored already. `next/font/google` is
  banned (lint rule + CI check). The Next dev-tools font request (`/__nextjs_font/*`) is dev
  only and served locally.
- **No outbound by default.** CSP stays `default-src 'self'`, `connect-src 'self'`,
  `font-src 'self'`, `img-src 'self' data: blob:`. `next.config` sets `images.remotePatterns: []`.
  Server-side outbound is confined to one module, `src/lib/net/outbound.ts`, whose `fetchOutbound`
  refuses unless `OUTBOUND_ALLOW` (env, default empty) lists the host; the only consumer in v1.1
  is the exchange-rate refresh (§5). SMTP is the owner's own server and is configured, not
  "outbound" in this sense.
- **CI guard.** `scripts/airgap-check.ts` scans the built `.next` output and `public/` for
  external URLs (`fonts.googleapis`, `gstatic`, `cdn.`, `unpkg`, `jsdelivr`, `googleapis`,
  `cloudflare`, `http(s)://` outside the allow-list of documentation links) and for the names of
  secret env vars in client bundles; it runs in the lint job and fails the build.
- **Update script.** `pnpm vendor:update [fonts|wordlist|flags|rates|beui|all]`
  (`scripts/vendor-update.ts`) refreshes every vendored resource from a connected machine:
  `fonts:vendor`, the EFF wordlist, flag SVGs, the bundled exchange-rate snapshot, and the beui
  components (re-runs `shadcn add` for the pinned list). Air-gapped instances update by
  rebuilding the image on a connected machine; `README.md` gets an "Air-gapped deployment"
  section.
- **Force HTTPS.** TLS terminates at Caddy (compose) or the ingress (k8s). The proxy adds a
  301 to `https://` when `FORCE_HTTPS=true` (default `true` in production, `false` in dev/CI) and
  the request arrived over plain http (no `x-forwarded-proto: https`), except for
  `/api/health/*`. HSTS is already sent on https.
- **Secrets off the frontend.** No `NEXT_PUBLIC_*` variable exists; `src/lib/env.ts` is
  `server-only`; the CI guard greps client bundles for secret names.

## 2. Sub-project M - Launch checklist

| # | Item | Treatment |
|---|---|---|
| 1, 2 | Privacy policy, terms | Task 26 already writes them; they become public pages `/legal/privacy`, `/legal/terms` (plus `/legal/cookies`, `/legal/licenses`), linked from the sign-in page, the cookie banner and the app footer. |
| 3 | Secrets off the frontend | §1. |
| 4 | Force HTTPS | §1. |
| 5 | Cookie consent | Task 25 (banner with the three categories; only strictly-necessary cookies exist, so the banner informs and links the policy). |
| 6 | Meta titles + descriptions | Every route exports `metadata` with a `description`; root layout uses `title.template = "%s · okinvo"`; a unit test walks `src/app/**/page.tsx` and fails on a page without one. |
| 7 | Social preview image | `src/app/opengraph-image.png` + `twitter-image.png` generated offline by `scripts/brand-icons.ts` (1200×630, wordmark on the dark canvas); `metadata.openGraph`/`twitter` in the root layout. |
| 8 | Favicon | Done (Task 2). |
| 9 | Sitemap + robots | `src/app/sitemap.ts` lists only public pages (`/`, `/auth/sign-in`, `/legal/*`); `src/app/robots.ts` disallows `/i/`, `/verify/`, `/api/`, `/settings`, `/invoices`, … and points at the sitemap. |
| 10 | Alt text | Every `<img>` and `<Image>` carries a meaningful `alt` or `alt=""` when decorative; `eslint-plugin-jsx-a11y` `alt-text` rule is an error; the document preview's logo gets the issuer name. |
| 11 | Compress images | Brand PNGs are written palette-quantised at compression level 9; uploads already re-encode; a unit test caps icon and OG image sizes. |
| 12 | Page load speed | `optimizePackageImports` for `lucide-react` and `radix-ui`; `tests/e2e/perf.spec.ts` asserts DOMContentLoaded < 2 500 ms and no request > 300 KB on the dashboard and the invoice list against the production build in CI (`pnpm build && pnpm start`). |
| 13 | Colour contrast | `tests/unit/contrast.test.ts` computes WCAG contrast from the generated colour tokens for every text/background pair in both themes and all eight accents (`on-primary` on each accent, `ink` / `ink-subtle` on `canvas` / `surface-*`, status text on its tint) and requires ≥ 4.5:1 (≥ 3:1 for large text and `ink-tertiary` placeholders). Failing tokens are corrected in `DESIGN.md` / `DESIGN.light.md`. |
| 14 | Mobile friendly | Task 8 plus the beui dock and bottom-sheet modals (§3). |
| 15 | Custom 404 | `src/app/not-found.tsx` uses the beui 404 block **(assumption: the "stacked" variant - it reads in both themes)** with "Back to dashboard". |
| 16 | Broken links | `tests/e2e/links.spec.ts` signs in, crawls every internal link reachable from the sidebar and settings nav (depth 2) and asserts each answers 200 (or a redirect to a 200). |
| 17 | Form validation | Zod at every boundary + the keyboard charset; every text input also carries native `required`/`pattern`/`maxLength` so the browser validates before a round trip (audit in the same task). |
| 18 | Spam protection | Public forms (share password, sign-in, sign-up) get a honeypot field (`website`, visually hidden; a filled one is dropped silently) on top of the existing rate limits. |
| 19 | Analytics | **(assumption: no third party, nothing outbound.)** A local, cookie-less page-view counter: `PageView { day, path, count }` incremented by the app layout (one row per path per day, no IP, no user id) and shown at Settings → Usage with a 30-day table; off by default behind `ANALYTICS_LOCAL=true`. |
| 20 | One clear call to action | Each view keeps exactly one primary button (dashboard: "New invoice"; sign-in: "Sign in"; lists: "New …"); `pnpm design:lint` fails on a second `variant="primary"` in one page file. |

## 3. Sub-project N - beui components

beui (https://beui.dev) is a shadcn registry: `shadcn add @beui/<name>` copies TypeScript source
into the repo, so the components are vendored and air-gap safe. They depend on `motion`,
`clsx`, `tailwind-merge`, `lucide-react` (present), and for some, `@tanstack/react-virtual` and
`@floating-ui/dom`. They live under `src/components/beui/` (as installed), are adapted only
through props and wrappers in `src/components/ui/*`, and are listed in `scripts/vendor-update.ts`
so `pnpm vendor:update beui` re-installs the pinned set. The design tokens come from the
existing shadcn mapping block in `globals.css`; nothing in `tokens.css` changes.

| beui component | Where it is used |
|---|---|
| `loader` (comet) | `SubmitButton` pending state, route `loading.tsx` files, the builder preview while a server action runs |
| `todo-list` (agents) | Invoice page "Payment progress" checkpoints (§4) |
| `date-range-picker` | Issue/due dates (single-date mode), payment dates, export and dashboard date ranges |
| `color-selector` | Settings → Appearance accent chooser (eight presets + a custom hex swatch that writes `accent-custom`) |
| `animated-breadcrumb` | `PageHeader` breadcrumb |
| `tabs` (overflow) | Settings nav, document detail tabs (Overview / Payments / History) |
| `switch` | Boolean settings and display-config toggles |
| `input` | The shared `Input` (keeps the keyboard-charset guard) |
| `select`, `multi-select`, `combobox` | Selects; multi-select for profile tags; combobox for issuer profile, client, catalogue picker |
| `checkbox`, `radio` | Shared primitives |
| `morphing-modal` / bottom sheet | Confirm dialogs and the share dialog on phones |
| `pull-to-refresh` | List pages on touch screens (router refresh) |
| `animated-sidebar` | The app sidebar (desktop rail, mobile sheet) |
| `dock` | Phone bottom navigation (Dashboard, Invoices, Clients, Settings, More) |
| `tooltip` | All tooltips |
| `digit-swap` (number) | PAN, GSTIN, VAT number, bank account / IFSC / UPI, API key: masked with bullets until "Reveal/Edit" |
| `animated-badge` | Status pills |
| `action-swap` | Copy link / copy password / copy API key buttons |
| `animated-toast-stack` | Flash messages and action results |
| `theme-toggle` (circle blur) | Theme toggle - adapted to the cookie + `data-theme` scheme, **no `next-themes`** (assumption) |
| `bouncy-accordion` | Legal pages, Settings sections, FAQ in docs |
| `range-slider` | Header image opacity, logo and header height |
| `table` | Every list table (virtualised, sortable); the card layout below `md` is kept |
| `swap` (block) | Tools → Currency converter (§5), adapted from chains/tokens to currencies |
| `attachment-upload` (file-upload block) | Receipts and bills on payments, asset pickers (logo, signature, stamp, letterhead, avatar) |
| `not-found-*` (block) | Custom 404 |

Adoption order: primitives (input, select, checkbox, radio, switch, tooltip, badge, toast)
→ navigation (sidebar, dock, breadcrumb, tabs) → data (table, date picker, combobox, multi-select,
number mask, range slider, colour selector, accordion) → overlays (morphing modal, pull to
refresh, loader) → blocks (404, file upload, swap). Every step keeps both themes, the keyboard
charset guard, and the e2e selectors (ids and labels) stable.

## 4. Sub-project O - Payment checkpoints and receipts

- The invoice page shows a "Payment progress" todo-list: Issued → Sent → Payment recorded (one
  per payment, with amount and date) → Paid in full → Receipt attached. Statuses come from the
  invoice DTO (`sentAt`, payments, balance) - no new state.
- Manual payment entry (existing "Record payment") gains attachments: a payment may carry
  several bills/receipts (`PaymentAttachment { paymentId, assetId }`, kind `RECEIPT`, **PDF or
  images only**, enforced by the existing upload validation), uploaded through the beui file-upload
  block. Attachments list and download from the invoice's Payments tab; they are included in the
  all-data export and the documents bundle (`receipts/`).

## 5. Sub-project P - Currency rates

- **Bundled snapshot.** `data/exchange-rates.json` - `{ asOf: "YYYY-MM-DD", base: "USD", rates:
  { INR: 83.1, … } }` for every catalogue currency, generated by `scripts/update-rates.ts` from
  a connected machine (source: open.er-api.com, no key) and committed; the image always has one.
- **Live refresh (optional).** When `OUTBOUND_ALLOW` includes `open.er-api.com` and
  `RATES_ONLINE=true`, a daily refresh (first request of the day, 5 s timeout, never on the
  request path of a document) stores the latest table in `ExchangeRateSnapshot { asOf, base,
  rates Json, source }`; failures fall back silently to the last snapshot or the bundle.
- **UI.** Tools → Currency (`/tools/currency`): the beui swap block adapted to currencies - amount,
  from, to, flip, result, and the line "Exchange rates as of <asOf> (bundled | live)". The
  dashboard's base-currency conversions use the same table.

## 6. Assumptions made here (owner may override)

1. Analytics are local only (no third-party script, no cookies, no IPs); off until
   `ANALYTICS_LOCAL=true`.
2. The 404 block variant is "stacked".
3. The beui theme toggle is adapted to the existing cookie + `data-theme` mechanism; `next-themes`
   is not added.
4. Outbound is a single gated module with an env allow-list; only exchange rates use it.
5. Receipts are many-per-payment, PDF or PNG/JPEG/WebP only (existing upload rules).
6. These sub-projects run after the plan's Task 46 as Tasks 47-60, with a second full
   verification at the end; the beui adoption is done last among them so earlier UI tasks are
   not rewritten twice.
