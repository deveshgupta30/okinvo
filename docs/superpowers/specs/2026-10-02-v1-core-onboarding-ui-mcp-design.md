# okinvo v1.1 - shell, onboarding, documents, platform, API/MCP, localisation: design

Date 2026-10-02 · branch `feature/v1-core-onboarding-ui-mcp` (from `main@a81b0f7`) · status: **approved by the owner on 2026-10-02 (defaults in §10 confirmed; scope extended, see §9b-§9e)**

This spec turns the owner's 27-point request (and the two "refined prompt" documents that came
with it) into a design the existing codebase can carry. It is one umbrella document with seven
sub-projects. Each sub-project gets its own implementation plan under `docs/superpowers/plans/`
and is built in the order listed in §2, with a green suite and a commit series per task.

Where this spec and `SPEC.md`, `IMPLEMENTATION_PLAN_v2.md`, `DESIGN.md` or `CLAUDE.md` disagree,
the sub-project that touches the area updates those documents in the same commit (§12 lists the
known edits). Nothing here changes the non-negotiable rules in `CLAUDE.md` except where §12 says so.

---

## 1. What the owner asked for, and what success looks like

The owner wants okinvo to feel like a polished product rather than an M5 build: a greeting on
the dashboard, a first-run wizard, a collapsible left panel with the real logo, a user menu,
theme and pastel accent choices, avatars, better templates and fonts, products with SKUs,
password-protected and shareable PDFs, a mobile-friendly layout, a language picker covering the
list in the screenshot, legal and cookie texts, a license and README, a status page, API keys
with an OpenAPI description and generated client, an MCP server and a skill so LLM agents can
read and create invoices and credit notes (never delete), Trivy and lint in Actions, and a
Wiki.js documentation site with screenshots.

**Success** is: a brand-new owner signs in, is walked through onboarding, lands on a dashboard
that greets them by name, and can do everything above from a phone or a laptop in their own
language and accent colour; a developer can mint an API key, read `/api/openapi.json`, use the
generated TypeScript client, and point Claude (or any MCP client) at `/api/mcp` to list and
create invoices; CI stays green and Trivy, ESLint and Prettier gate every pull request.

**Owner's standing constraints (unchanged):** self-hosted only, no managed cloud services, no
extra infrastructure beyond Postgres (Wiki.js is the one explicit exception, see §9), Docker
Desktop locally, personal GitHub account, `.env` never committed.

### 1.1 Where the refined prompts and this codebase disagree

| Refined prompt says | This design does | Why |
|---|---|---|
| Redis-backed sliding-window rate limit for API keys | Postgres-backed limiter that already exists (`RATE_LIMIT_STORE=postgres`), keyed per API key | `CLAUDE.md`: no Redis or other extra infrastructure |
| GeoIP for the default country | Infer from the browser timezone and `navigator.language`; fall back to India | No external services; a self-hosted app has no GeoIP database |
| Store accent in `localStorage` | Store on the `User` row and mirror in a cookie, like the theme | Server-rendered pages must paint the right colour on first load; `localStorage` cannot do that |
| Google Fonts picker | Vendored `@fontsource` files served from the app's own origin | No requests to Google from the browser (privacy), and PDFs render offline |
| `okinvo.app/i/:token` public viewer | `/i/<token>` on the operator's own domain | There is no central okinvo service |
| Trivy in a separate `security.yml` | `security.yml` for repo scans (fs, secrets, IaC) + the existing image scan in `ci.yml` | Both; the image scan must stay on the PR path |
| Hash API keys with SHA-256, show once | Same | Already the pattern for verification tokens |
| Wiki.js hosting | Optional Compose profile `docs` on its own hostname; the documentation source lives in the repo | Extra infrastructure, so opt-in only |

---

## 2. Decomposition and build order

| # | Sub-project | Items from the request | Why this order |
|---|---|---|---|
| A | **Shell & identity** | 1, 3, 4, 5, 6, 7, 10, 11, 26 (+ 2 pre-existing defects) | Everything else renders inside this shell; fixes a data leak first |
| B | **Onboarding & preferences** | 2, 14, and the Account half of 13 | Needs the avatar, country and currency pieces from A |
| H | **Multi-user roles** (added) | owner's addition | Before E: API keys and every later screen depend on roles |
| C | **Catalogue & documents** | 8, 9, 23, 24, 27 | Independent domain work; the largest sub-project |
| J | **DOCX output** (added) | owner's addition | Right after C: same view-model and templates |
| D | **Platform & compliance** | 12, 15, 16, 17, 18, 19 | Mostly additive; README last because it documents everything |
| E | **API keys, OpenAPI, SDK, MCP, skill** | 20 (API part), 21, 22 | Builds on C's products/catalogue and on D's status endpoint |
| F | **Localisation (UI)** | 13 | Touches every string; done late so new screens are translated once |
| I | **Translated documents & non-Latin fonts** (added) | owner's addition | After F: reuses the catalogues |
| K | **E-invoicing** (added) | owner's addition | After C, H, I: needs products/HSN, settings roles, document locale |
| G | **Documentation site** | 20 (Wiki.js part) | Screenshots must show the finished UI |

Build order is the table order: A, B, H, C, J, D, E, F, I, K, G. Item 25 ("what else can we add?") is answered in §11 and does not produce work in this branch.

Each sub-project is one plan and one PR-sized commit series on this branch; the owner can stop
after any sub-project and still have a releasable app.

---

## 3. Sub-project A - Shell & identity

### 3.1 Pre-existing defects fixed first (test-first, one commit each)

1. **Decrypted US tax ID reaches the browser.** `ProfileDto.usTaxId` holds the decrypted
   EIN/SSN and `builderContext()` ships `ProfileDto[]` to the client component `InvoiceBuilder`.
   Fix: a `BuilderProfile` projection without secrets (id, label, legal name, currency, locale,
   regime, archived flag, defaults the builder needs). `listProfiles` keeps returning the full DTO
   for the owner-only settings pages. Test: the serialised builder context contains no `usTaxId`.
2. **UK VAT exempt flag lost on edit.** `valuesFromInvoice` does not copy `taxExempt`. Fix: copy
   it; test re-opens a draft with an exempt line and asserts the hidden input is `true`.
3. **`todayFor(user)` does not exist.** `CLAUDE.md` names it; the code uses
   `todayIn(actor.timezone)`. The doc is wrong; fix the doc.

### 3.2 Brand assets

- `logo/gen-word.svg`, `logo/gen-word-light.svg`, `logo/fresh-b3.svg`, `logo/fresh-b3-light.svg`
  are copied to `src/components/brand/*.svg` and imported as React components by a tiny hand-written
  wrapper (no SVGR dependency: the four files are small enough to inline as JSX in
  `src/components/brand/logo.tsx` with the `fill` colours replaced by `currentColor` and the
  green dot by the brand token `--color-brand-dot` = `#87D9A8`). The wordmark's live Arial text is
  kept as the owner delivered it; the comment in the file says the final letterforms will be drawn
  later, so the component is the single place to swap them.
- Theme handling: one component `<Logo variant="word" | "mark" />` picks ink or off-white from
  the current `data-theme` through CSS (`text-ink`), so there is no JS theme branching.
- Favicons: `src/app/icon.svg` (the mark, ink on transparent, with a `prefers-color-scheme` media
  rule inside the SVG so the dot stays green and the ring flips to off-white on dark browsers),
  `src/app/apple-icon.png` (180 px, light background) generated by a script from the SVG with
  sharp, and `manifest.webmanifest` for the mobile home-screen icon.
- Sign-in page shows the wordmark above the form.

### 3.3 Sidebar

`src/components/app-sidebar.tsx` is rewritten as `src/components/shell/*`:

- `shell/sidebar.tsx` (client): widths 240 px expanded, 64 px rail. State lives in a cookie
  `okinvo.sidebar=expanded|collapsed` (1 year, `SameSite=Lax`, readable by JS) and in
  `localStorage` as a convenience mirror; the server reads the cookie so the first paint is correct.
  Transition `width 200ms ease-out` plus label fade; disabled under `prefers-reduced-motion`.
  Collapse toggle at the top next to the logo (`PanelLeftClose` / `PanelLeftOpen`), keyboard
  shortcut `[`.
- Expanded shows the wordmark; collapsed shows the mark. Nav items show icon + label, or icon with
  a tooltip when collapsed.
- The aside is `sticky top-0 h-dvh`; the nav scrolls inside it; the footer stays visible.
- **Footer hierarchy (top to bottom):** theme toggle, Settings, user block. Exactly as requested:
  1. **Theme toggle** - a three-state segmented control (System / Light / Dark) when expanded, a
     single cycling icon button when collapsed. It writes the `okinvo.theme` cookie immediately
     (the inline init script already honours it on reload) and calls a server action
     `setThemeAction` that persists `User.theme` and is audited as `account.updated`.
  2. **Settings** - link to `/settings` (a new index page that redirects to `/settings/profiles`,
     so the 404 goes away).
  3. **User** - avatar + name + email; clicking opens a menu with **Profile** (`/settings/account`)
     and **Log out** (the existing `signOutAction`). Keyboard and screen-reader accessible
     (Radix `DropdownMenu` from the `radix-ui` umbrella already installed).
- **Mobile (< 768 px):** the aside is hidden; a top bar with the mark, the page title and a
  hamburger opens a drawer (Radix `Dialog` styled as a sheet: 280 px, slide-in 200 ms, dimmed
  backdrop, focus trapped, closes on route change). The footer hierarchy is identical.
- Theme cookie is also re-synced from `User.theme` on every signed-in layout render when the
  cookie is missing, which fixes the "new browser starts at system" gap.

### 3.4 Accent colours (pastel)

- `DESIGN.md` gains an `accents:` block with the curated pastel set. Each accent defines
  `primary`, `primary-hover`, `primary-focus`, `on-primary` for dark and light:

  | id | name | swatch (dark canvas) | note |
  |---|---|---|---|
  | `mint` | Mint | `#87D9A8` | the logo's dot; **default** |
  | `lavender` | Lavender | `#B9B7F2` | pastel sibling of today's `#5e6ad2` |
  | `sky` | Sky | `#8EC5F2` | |
  | `peach` | Peach | `#F5B89A` | |
  | `butter` | Butter | `#F2DE8A` | |
  | `rose` | Rose | `#F2A7B8` | |
  | `sage` | Sage | `#B9D4A3` | |
  | `lilac` | Lilac | `#D9B8F0` | |

  Pastels need dark text: `on-primary` is the ink colour (`#17191E`) for every accent in both
  themes. Hover is 8 % darker, focus is the accent itself. The design-tokens generator emits
  `:root[data-accent="<id>"]` and `:root[data-accent="<id>"][data-theme="light"]` overrides for
  those four tokens, and `design:lint` keeps checking WCAG contrast for `button-primary`
  with each accent (the generator adds one `components:` entry per accent).
- The accent is stored on `User.accent` (default `mint`), mirrored in the `okinvo.accent` cookie
  and applied as `data-accent` on `<html>` by the same inline init script as the theme.
- Picker: Settings → **Appearance** (new tab) shows theme and eight swatches with live preview.
- `CLAUDE.md` design rule changes from "lavender only for…" to "the accent only for…".

### 3.5 Avatars and initials

- New `AssetKind.AVATAR`; uploads re-encoded by sharp to a 512 × 512 PNG, max 2 MB input.
- `User.avatarAssetId` (unique FK to `Asset`). Better Auth's `image` column stays unused: social
  providers put external URLs there and the app must not hot-link them.
- Cropper: `react-easy-crop` (MIT) in a dialog: pick file → pan and pinch/scroll zoom inside a
  circular mask → "Save" draws the crop to a canvas and posts it to `/api/uploads` with
  `kind=AVATAR`. Works with touch.
- `<Avatar user size>` renders a circle everywhere (sidebar footer, user menu, Account page,
  onboarding): the image when set, otherwise initials on the accent colour. `initialsOf(name)`
  takes the first letter of the first two words ("Allison Murray Roy" → "AM", "Priya" → "P",
  empty → the first letter of the email).
- The Account page gets "Change photo" / "Remove photo".

### 3.6 Dashboard greeting

`PageHeader` title becomes "Hi, <first name>" (first word of `User.name`, falling back to the
email's local part) with the existing fiscal-year line as the description. Translatable later.

### 3.7 Animations

CSS only, no new dependency: sidebar width/label fade, drawer slide and backdrop fade, settings
tab content cross-fade (`animate-in fade-in-0 slide-in-from-bottom-1` 150 ms on the tab panel
keyed by pathname), dialog zoom (exists), toast slide. All disabled under reduced motion (rule
exists in `globals.css`).

### 3.8 Mobile pass

Every signed-in page is checked at 390 × 844 and 768 × 1024:
- Tables become stacked cards below `md` (`<ResponsiveTable>` wrapper that renders `<Table>` on
  `md+` and a card list with the same cells below).
- Builder: preview moves under the form in an accordion ("Preview") on small screens; line items
  become stacked rows with labelled inputs.
- Page header actions wrap; primary action stays visible.
- Touch targets ≥ 40 px; form controls `h-10` on touch devices via `pointer: coarse`.
- Playwright gets a `mobile` project (Pixel 7 profile) that runs the smoke spec and an onboarding
  spec.

### 3.9 Tests (A)

Unit: `initialsOf`, accent token generation, sidebar cookie parsing. Integration: avatar upload
pipeline, `setThemeAction`/`setAccentAction` DAL audit. E2E: collapse/expand persists across reload,
mobile drawer opens and navigates, user menu logs out, theme toggle flips `data-theme`, builder
context has no `usTaxId`.

---

## 4. Sub-project B - Onboarding & preferences

### 4.1 Data model

`User` gains: `countryCode String?` (ISO 3166-1 alpha-2), `currency String?` (ISO 4217),
`locale String @default("en-US")`, `accent String @default("mint")`, `usage String?`
(`PERSONAL` | `BUSINESS`), `onboardedAt DateTime?`, `avatarAssetId String? @unique`.
Better Auth `additionalFields` are extended so the client can read them; writes go through the
DAL (audited `account.updated`), not through Better Auth's `update-user`.

### 4.2 Flow

- The signed-in layout redirects to `/onboarding` while `onboardedAt` is null (the sign-in,
  legal, health and public routes are exempt). The wizard cannot be skipped, but every step
  autosaves so a reload resumes.
- **Step 1 - "Tell us about you."** Avatar (optional, cropper from A), Name (required), Email
  (shown read-only with "This is your sign-in identity; change it from Settings → Security" -
  changing the identity email needs re-verification and is out of scope), Country (required;
  preselected from the browser timezone → country map, then `navigator.language` region, then
  India), Preferred currency (required; preselected from the country: IN→INR, GB→GBP, US→USD;
  the list is the full ISO 4217 set with the three pinned on top).
- **Step 2 - "How will you use okinvo?"** Two cards: *Personal invoicing* / *Business
  invoicing*. Below, "Do you have a GSTIN?" Yes/No; Yes reveals a GSTIN input validated with the
  format regex and the mod-36 check digit (`src/lib/tax/gstin.ts`, unit-tested). Shown only when
  the country is India; for GB it becomes "Are you VAT registered?" with a VAT number field, for
  US nothing.
- **Step 3 - "You're set."** Summary and a primary button **"Go to profiles →"** that marks
  `onboardedAt` and opens `/settings/profiles/new?from=onboarding`, which prefills label, legal
  name, email, country, base currency, locale and GSTIN/VAT from the answers.
- Copy is written for a freelancer, short and plain; exact strings live in the plan.

### 4.3 Settings → Account (item 14 and the account half of 13)

Account page sections: Photo and name · Sign-in email (read-only) · **Region**: Country
(United States, United Kingdom, India; India default; each with an inline SVG flag, no emoji
dependence) and Currency (USD, GBP, INR + the full list) · **Language** (the picker from §8,
grouped by region) · Timezone (exists). Theme and accent move to the Appearance tab.
Country and currency are the defaults for new issuer profiles and for the dashboard when no
profile exists.

### 4.4 Tests (B)

Unit: GSTIN check digit, timezone→country map, currency-for-country. Integration: onboarding
DAL (`completeOnboarding`), profile prefill. E2E: a fresh user is forced through the wizard, the
profile form arrives prefilled, the dashboard greets by first name; mobile variant.

---

## 5. Sub-project C - Catalogue & documents

### 5.1 Products with SKUs (item 24)

- New model `Product`: `id`, `sku @unique` (1-40 chars, `[A-Za-z0-9._/-]`), `name`,
  `description?`, `unitType` (default `UNIT`), `unitPrice Decimal(14,2)`, `currency`,
  `hsnCode?`, `defaultTaxRate Decimal(5,2)`, `isActive`, `archivedAt`, timestamps,
  `invoiceItems`, `issuerProfiles IssuerProfile[]`.
- Pages `/products`, `/products/new`, `/products/[id]/edit` mirror Services (same form pattern,
  table, archive, export). Sidebar gets **Products** under Services (icon `Package`).
- `InvoiceItem` gains `productId String?` (FK, `onDelete: SetNull`) and `sku String?` (snapshot
  at the time the line is added; printed in a small mono line under the description when
  `displayConfig.showSku` is on, default on when any line has a SKU).
- Exports: new dataset `products`; `invoice-items` gains a `SKU` column; all-data `data.json`
  includes products. SPEC §6 (exports) is updated.

### 5.2 Tagging catalogue items to profiles (item 23)

- Implicit many-to-many `ServiceItem.issuerProfiles` and `Product.issuerProfiles`. No tags means
  "available to every profile".
- The service and product forms get a "Profiles" checkbox group.
- The builder's "Add from catalogue" select shows two optgroups (Services, Products) filtered to
  items tagged with the selected issuer profile or untagged, and re-filters when the issuer
  changes. The issuer selector itself already exists; the credit-note builder keeps the invoice's
  issuer by rule (SPEC §4.8).

### 5.3 Fonts (item 9)

- `src/lib/documents/fonts/catalog.ts`: 100 Google families, 50 sans and 50 serif, each
  `{ id, family, category, weights: [400, 600] (+700 where shipped), package: "@fontsource/<id>",
  license: "OFL-1.1" | "Apache-2.0" | "UFL-1.0" }`. The list is fixed in the plan; every family
  is a current `@fontsource` static package with Latin subsets (the renderer needs WOFF/TTF, and
  Fontsource static packages ship WOFF).
- `scripts/vendor-fonts.mjs` reads the catalog, copies the Latin WOFF files for the listed
  weights into `public/fonts/<id>/`, and regenerates `src/app/document-fonts.css` (preview
  `@font-face` rules) and `src/lib/documents/fonts/registry.generated.ts` (`Font.register`
  descriptors). Budget: ≈ 100 families × 3 weights × ~25 KB ≈ 8 MB in `public/fonts`.
- Template config `font` becomes `{ heading: FontId, body: FontId }`; the three legacy string
  values are mapped on read (`"source-serif-4+inter"` → heading `source-serif-4`, body `inter`).
- The template form gets two font pickers with a live sample line rendered in the font itself,
  grouped Sans / Serif, searchable.
- Limitation stated in the UI and SPEC: Latin scripts only in PDFs; UI translations (§8) do not
  change document fonts.

### 5.4 Templates (item 8)

- `TEMPLATE_IDS` becomes `["ledger", "classic", "compact", "minimal", "letterhead", "modern"]`.
  - **minimal**: no rules or boxes, generous whitespace, light-weight labels, totals right-aligned
    with one hairline above the grand total.
  - **letterhead**: a full-width header band (colour or image) carrying logo, issuer and title;
    body like `ledger`.
  - **modern**: accent-coloured left column (issuer block, QR, payment details) and a wide right
    column for parties and the table.
- New config block `header`: `{ style: "none" | "band" | "image", color?: "#rrggbb",
  imageAssetId?: string, imageOpacity: 0-1 (default 1), heightMm: 20-60 (default 32),
  text: "auto" | "light" | "dark" }`. `auto` picks light or dark text by the band colour's
  luminance; for images the text sits on a translucent scrim. The band is available on every
  template (default `none`; `letterhead` defaults to `band`).
- New `AssetKind.LETTERHEAD` for header images (PNG/JPEG → PNG, ≤ 2 MB, ≤ 2400 px wide). The
  PDF inlines it as a data URL at `imageOpacity` (react-pdf `opacity`); the preview uses the same.
- **A4 fit:** paper stays A4 by default (Letter remains available). The plan adds a 60-line and a
  3-page acceptance test asserting the header row repeats, totals never split across pages
  (`wrap={false}`), nothing paints into the 18 pt footer band, and the first page's layout is
  identical between HTML preview and PDF at 96/72 scale. The builder preview shows an
  "approx. N pages" badge computed client-side from measured row heights.
- `templateSnapshot` compatibility: `mergeTemplateConfig` keeps filling defaults, so old
  snapshots render as before.

### 5.5 Password-protected PDFs and share links (item 27)

**Encryption** happens in the renderer: `@react-pdf/renderer` passes `userPassword`,
`ownerPassword`, `permissions` and `pdfVersion` to pdfkit. With `pdfVersion: "1.7ext3"` pdfkit
uses the PDF 2.0 standard security handler with AES-256. Permissions:

| flag | value |
|---|---|
| printing | `highResolution` |
| copying | `false` |
| modifying | `false` |
| annotating | `false` |
| fillingForms | `false` |
| documentAssembly | `false` |
| contentAccessibility | `true` (screen readers; decision §10.5) |

Encrypted output is not byte-stable (random IVs and salts), so protected copies never replace
the canonical PDF: they are stored as their own `Document` rows with `format = PDF_PROTECTED`
(enum extended; `DOCX` stays unused) under
`documents/.../<number>-v<n>-protected.pdf`, hashed like any other version, and listed on the
verify page so a recipient can check a protected file too.

**Where the owner sets it:** the invoice and credit-note pages get a **Share** button that opens
one dialog with:
- "Protect with a password" toggle. On: **Auto-generate** (six-word passphrase from a 2 000-word
  list via `crypto.randomInt`, with reveal and copy) or **Enter manually** (minimum 12 characters,
  zxcvbn-free strength meter based on length and class mix). The password is shown exactly once
  after saving and stored encrypted at rest (`FIELD_ENCRYPTION_KEY`) so the owner can re-download
  the same protected file; the share page verifies it against a scrypt hash.
- "Create link" → `/i/<token>` is created (token: 32 random bytes, stored as SHA-256 + encrypted
  copy like verification tokens), with optional expiry (7 / 30 / 90 days / never) and a Revoke
  button. The link is copied with one click.
- "Download protected PDF" appears once a password is set (owner-side download of the
  `PDF_PROTECTED` version).

**Public viewer `/i/<token>`** (new public prefix; added to `PUBLIC_PREFIXES` and `CLAUDE.md`):
- Rate-limited (`share` bucket, 30/min/IP), `noindex`, no asset URLs (images inlined as data URLs
  in a server-rendered `DocumentPreview`).
- Unprotected link: read-only preview, **Download PDF** (canonical version) and **Print** (opens
  the PDF in a new tab for the browser's print dialog).
- Protected link: a password form first (same rate limit; constant-time scrypt compare; 5
  failures per IP per 15 min → 429). Success sets a signed, link-scoped cookie (`okinvo.share.<id>`,
  HMAC with `AUTH_SECRET`, 1 h, `HttpOnly`, `SameSite=Strict`), then the viewer shows the preview
  and downloads the protected PDF. The PDF itself still requires the password to open, so a
  leaked link alone exposes nothing.
- Voided documents show a "Void" banner; drafts can never be shared (the DAL refuses).
- Every view and download is audited (`share.viewed`, `share.downloaded`) with the IP when
  `TRUST_PROXY` allows it; the dialog shows view count and last viewed.

Model `ShareLink`: `id`, `kind`, `invoiceId?`/`creditNoteId?`, `tokenHash @unique`, `tokenEnc`,
`passwordHash?` (scrypt), `pdfPasswordEnc?`, `ownerPasswordEnc` (random, never shown),
`expiresAt?`, `revokedAt?`, `viewCount`, `lastViewedAt?`, `createdById`, timestamps.

### 5.6 Tests (C)

Unit: SKU validation, font catalog integrity (every package exists in the lockfile and has the
weights), header luminance → text colour, passphrase generator entropy, strength meter.
Integration: products DAL, profile tagging filters the builder context, letterhead upload kind,
`PDF_PROTECTED` version creation, share link lifecycle (create, view, wrong password → 429,
expiry, revoke), pdf.js opens the protected file only with the password and reports the
permission flags. E2E: product added to an invoice with SKU printed, template switched to
letterhead with an image, share link copied, opened in a fresh context, password gate passed,
protected PDF downloaded.

---

## 6. Sub-project D - Platform & compliance

### 6.1 License, README (items 17, 18)

- `LICENSE`: Apache-2.0 (decision §10.2), `package.json` `license` field, `NOTICE` with the
  copyright line, and `THIRD_PARTY_NOTICES.md` generated by `pnpm licenses list --json` through
  `scripts/third-party-notices.mjs` (checked in CI for staleness).
- `README.md` rewritten: what okinvo is, screenshots (from §9), architecture diagram (Mermaid),
  quick start (Compose), development setup, configuration reference (table generated from
  `env.schema.ts`), API and MCP quick start, documentation site, security policy pointer,
  license.

### 6.2 Actions (item 12)

- `ci.yml`: a dedicated `lint` job (ESLint, Prettier, typecheck, design lint, tokens check,
  SDK freshness, third-party notices freshness) that `test` no longer repeats; `test` keeps the
  suites, `image` keeps Trivy on the built image.
- New `security.yml`: on PRs, pushes to `main` and weekly: Trivy `fs` (vulnerabilities, secrets,
  misconfigurations) over the repo, Trivy `config` over `docker/`, `compose*.yml`, `k8s/`;
  `--severity HIGH,CRITICAL --exit-code 1 --ignore-unfixed`; results as a job summary table (no
  SARIF upload, which needs code scanning on a private repo). `pnpm audit` stays in `test`.
- Dependabot-style updates stay with Renovate (exists).
- **Runner policy (owner's request, already implemented on this branch):** every workflow starts with
  a `runner` job that calls the reusable `pick-runner.yml`; it uses the self-hosted runner when one
  is online (Actions API probe with the `RUNNER_PROBE_TOKEN` fine-grained token, or the `CI_RUNNER`
  repository variable as an override) and GitHub-hosted `ubuntu-latest` otherwise. Jobs use
  `runs-on: ${{ fromJSON(needs.runner.outputs.labels) }}`. The self-hosted runner is a Windows
  workstation, so all `run` steps are bash, Compose uses the `okinvo-ci` project with its own ports
  (`DEV_PG_PORT`, `DEV_SMTP_PORT`, `DEV_MAILPIT_PORT`), the e2e server listens on `E2E_PORT`, and
  Linux-only steps carry `runner.os` conditions with a container-based alternative. `security.yml`
  follows the same pattern.

### 6.3 Cookie notice (item 15)

The app sets only strictly necessary cookies: session (`better-auth.session_token`),
`okinvo.theme`, `okinvo.accent`, `okinvo.sidebar`, `okinvo.locale`, `okinvo.cookie-notice`,
and per-link share cookies. A bottom banner on first visit (public and signed-in pages) says so,
links to `/legal/cookies`, and has one button "Got it" (no tracking means no consent choice is
needed under ePrivacy; the notice is informational). Dismissal is a 1-year cookie. Settings →
Account → Privacy shows the same list and a "Show the notice again" link.

### 6.4 Legal documents (item 16)

Public routes under `/legal/*`, server-rendered TSX (no markdown dependency, CSP-safe), printable,
with a table of contents and "Last updated":

- `/legal/terms` - Terms of Service (operator ↔ user: account, acceptable use pointer, fees
  (none), warranties, liability, termination, governing law, changes).
- `/legal/acceptable-use` - Terms of Use / Acceptable Use Policy (prohibited uses, API and
  MCP use, rate limits, security testing rules).
- `/legal/privacy` - Privacy Policy (controller identity, data categories by feature, lawful
  bases, retention, processors (none by default; SMTP/S3 if configured), rights under GDPR,
  UK GDPR, CCPA and India's DPDP Act, international transfers, children, contact).
- `/legal/cookies` - Cookie Policy (the table above).
- `/legal/data-retention` - retention schedule per record type and the backup window.
- `/legal/security` - security practices summary and responsible-disclosure contact.
- `/legal/licenses` - third-party notices.

The operator's details (legal name, address, contact and privacy e-mails, governing law, DPO)
come from Settings → **Legal** (`AppSetting['legalOperator']`, Zod-validated). Unset fields render
as highlighted placeholders and the Settings page warns until they are filled. Footer links on the
sign-in page, the share viewer and the Settings pages. All texts are written in full in the plan
(no placeholders), in plain English, and translatable later.

### 6.5 Status page (item 19)

Settings → **Status**: app version (`package.json` + `OKINVO_BUILD_SHA` and `OKINVO_BUILD_DATE`
baked in by Dockerfile `ARG`s and the release script), uptime, Node version, database (ping
latency, last applied migration name and time, pending migrations = 0), storage (probe
write/read/delete on `probes/<id>`), rate-limit store, SMTP configured (yes/no + last test),
backups (existing card), e-mail queue (last 24 h sent/failed). Each row is OK / Warning /
Failed. Backing endpoint `GET /api/health/status` (owner-only JSON) is reused by the MCP `status`
tool and the docs.

### 6.6 Tests (D)

Unit: legal operator schema, cookie-notice cookie parsing, status aggregation with mocked probes.
Integration: `/api/health/status` with a real DB and storage. E2E: banner shows once, legal pages
render without placeholders when operator details are set, status page renders.

---

## 7. Sub-project E - API keys, OpenAPI, SDK, MCP, skill

### 7.1 API keys (item 20)

- Model `ApiKey`: `id`, `name`, `prefix` (first 10 chars shown in lists), `keyHash @unique`
  (SHA-256 of the full key), `scopes String[]`, `expiresAt?`, `lastUsedAt?`, `revokedAt?`,
  `userId`, timestamps. Key format `okv_<32 bytes base64url>`; shown once at creation.
- Scopes: `invoices:read`, `invoices:create`, `credit_notes:read`, `credit_notes:create`,
  `catalogue:read` (clients, profiles, services, products, payment methods), `documents:read`,
  `status:read`. There is deliberately no `*:delete`, `*:void` or `payments:*` scope.
- `requireApiActor(scope)` accepts `Authorization: Bearer okv_…` (hash lookup, not revoked, not
  expired, scope present) or the existing 15-minute JWT (owner session; all scopes). The returned
  `Actor` carries `via: "api-key" | "jwt" | "session"` and `apiKeyId`; audit events record it.
  Rate limit bucket `api`: 120 requests/min per key (Postgres store in production).
- Settings → **API**: create (name, scopes, expiry), list, revoke; curl examples for every
  endpoint with the real `APP_URL`; links to `/api/openapi.json`, the SDK and the MCP setup.

### 7.2 REST API v1

JSON, under `/api/v1`, documented by OpenAPI 3.1. Reads return the same DTOs the pages use;
creates take the same Zod inputs as the server actions (one source of truth).

| Method | Path | Scope |
|---|---|---|
| GET | `/invoices` (filters: status, issuer, client, fiscalYear, cursor) | `invoices:read` |
| GET | `/invoices/{id}` | `invoices:read` |
| GET | `/invoices/{id}/pdf` | `documents:read` |
| POST | `/invoices` (draft from `InvoiceDraftInputSchema`) | `invoices:create` |
| POST | `/invoices/{id}/issue` | `invoices:create` |
| GET | `/credit-notes`, `/credit-notes/{id}`, `/credit-notes/{id}/pdf` | `credit_notes:read` / `documents:read` |
| POST | `/credit-notes` (`{ invoiceId, subtotal, reason }`), `/credit-notes/{id}/issue` | `credit_notes:create` |
| GET | `/clients`, `/profiles`, `/services`, `/products`, `/payment-methods` | `catalogue:read` |
| GET | `/status` | `status:read` |

`DELETE`, `PUT` and `PATCH` return 405 everywhere under `/api/v1` and `/api/mcp` (enforced in
`proxy.ts` as well as by the absence of handlers). Errors: `{ error: { code, message,
issues? } }` with the same codes the actions use. Every POST is audited with the key's name.

### 7.3 OpenAPI and SDK (item 21)

- `zod-openapi` (Zod 4-compatible) annotates the existing schemas and builds the document in
  `src/lib/api/openapi.ts`; served at `GET /api/openapi.json` (public, no secrets, cached) and
  snapshot-tested.
- `@hey-api/openapi-ts` generates `sdk/` (TypeScript, fetch client, README with examples) via
  `pnpm sdk:generate`; the generated code is committed and CI fails if it is stale. The SDK is
  not published to npm in this branch.

### 7.4 MCP server and skill (item 22)

- `@modelcontextprotocol/sdk` server mounted at `POST /api/mcp` (Streamable HTTP, stateless, JSON
  responses; `GET` and `DELETE` → 405). Auth: API key Bearer; the key's scopes decide which tools
  are listed.
- Tools (inputs are Zod, mirroring the REST payloads): `list_invoices`, `get_invoice`,
  `create_invoice`, `issue_invoice`, `list_credit_notes`, `get_credit_note`, `create_credit_note`,
  `issue_credit_note`, `list_clients`, `list_profiles`, `list_catalogue`, `get_status`.
  Resources: `okinvo://invoices/{id}/pdf` and `okinvo://credit-notes/{id}/pdf` (blob, base64).
  No delete, void, payment or settings tools exist, and the transport rejects any tool name
  outside the registry.
- Skill: `skills/okinvo-invoicing/SKILL.md` (+ `reference.md` with the REST and MCP contracts)
  in the Agent Skills format, so Claude Code or any skills-aware agent can use the API; a
  `.mcp.json.example` and a Claude Desktop config snippet are in the docs.
- Integration tests drive the MCP endpoint over HTTP: `initialize`, `tools/list` (scope-filtered),
  `tools/call create_invoice` → `issue_invoice` → `resources/read` PDF, and `tools/call` of a
  non-existent `delete_invoice` → error.

---

## 8. Sub-project F - Localisation (item 13)

### 8.1 Framework

- `next-intl` 4 with the App Router (`src/i18n/request.ts` resolves the locale from
  `User.locale`, else the `okinvo.locale` cookie, else `Accept-Language`, else `en-US`).
  Messages in `messages/<locale>.json`, namespaced per area (`shell`, `dashboard`, `invoices`, …),
  ICU plurals. `<html lang dir>` set from the locale; RTL locales (`ar`, `fa`, `ur`, `ps`, `he`,
  `ckb`, `syr`, `sd`) get `dir="rtl"` and the shell uses logical CSS properties (`ps-*`, `ms-*`).
- Dates, numbers and money in the UI use the user's locale through the existing `src/lib/format`
  (replacing the hard-coded `en-GB` instants); documents keep the issuer profile's locale.
- `pnpm i18n:check` fails when any catalogue misses a key present in `en-US.json`, and when a
  string literal appears in JSX under `src/app` or `src/components` without a `t()` (ESLint rule
  from `eslint-plugin-i18n-json`-free custom rule: a small AST check in `scripts/`).
- Language picker: Settings → Account → Language; grouped **Africa, Americas, Asia, Europe,
  Middle East, Oceania** (plus "Constructed" for Esperanto), each entry shown in its own language
  name as in the screenshot, English (US) default. The full list of 115 entries with BCP-47 tags
  and region is fixed in the plan (`src/lib/i18n/languages.ts`).

### 8.2 Catalogue scope (decision §10.1)

Default proposal: `en-US` and `en-GB` written by hand; the other 113 catalogues are generated
by translation subagents in batches of ~10, each file carrying `"@@generated": true`, and the
picker shows a small "Machine-translated - help improve" note for those locales linking to the
repository. Documents (PDFs) are not translated in this branch.

### 8.3 Tests (F)

Unit: language table integrity (unique tags, every region known, RTL set), locale resolution
order. Integration: `User.locale` round-trip. E2E: switching to `hi` changes the shell strings and
`lang`, switching to `ar` sets `dir="rtl"` and mirrors the sidebar.

---

## 9. Sub-project G - Documentation site (item 20, Wiki.js)

- Source of truth is the repo: `docs/wiki/**.md` (Getting started, Onboarding, Profiles,
  Clients, Services and Products, Invoices, Credit notes, Payments, Templates and fonts, Sharing
  and protected PDFs, Exports and backups, Settings reference, API and SDK, MCP and skills,
  Security, Operations (Compose, Kubernetes), FAQ) with screenshots in `docs/wiki/assets/`.
- Screenshots are produced by `scripts/docs-screenshots.ts` (Playwright against a seeded demo
  database, both themes, desktop and mobile) so they never go stale by hand.
- Wiki.js runs as the optional Compose profile `docs` (`ghcr.io/requarks/wiki:2`, its own
  `wiki` database created by `docker/postgres/initdb/10-wiki.sh` on first start, served by Caddy
  on `docs.<DOMAIN>` / `https://docs.localhost:8443` locally). `scripts/wiki-sync.ts` upserts the
  markdown tree and assets through the Wiki.js GraphQL API (`WIKI_URL`, `WIKI_TOKEN` env, never
  committed). `k8s/` gets a matching optional overlay.
- The same markdown renders on GitHub, so the docs are usable without Wiki.js.

---

## 9b. Sub-project H - Multi-user roles

Added to scope by the owner on 2026-10-02. Built right after B because API keys (E) and every
later screen depend on it.

- **Roles:** `UserRole` becomes `OWNER | EDITOR | VIEWER`. OWNER: everything. EDITOR: clients,
  catalogue, invoices, credit notes, payments, e-mail sending, exports of those datasets; no
  settings beyond their own account. VIEWER: read-only (register, documents, dashboard, exports
  of datasets they can read). The first user stays OWNER and at least one active OWNER must
  always remain (the DAL refuses the last demotion or deactivation).
- **Enforcement:** `src/server/dal/authz.ts` grows `requireRole(actor, "OWNER" | "EDITOR")`;
  `requireWriter` admits OWNER and EDITOR; settings DALs (profiles, payment methods, templates,
  e-mail settings, data/backups, users, API keys, legal, e-invoicing) call `requireRole(actor,
  "OWNER")`. `src/server/auth.ts` gains `requireRole(role)`; `requireOwner()` stays as the OWNER
  shorthand and pages pass the lowest role that may open them. UI hides what the role cannot do;
  the server is the boundary.
- **Members:** Settings → **Users** (OWNER only): list members (avatar, name, e-mail, role,
  last sign-in, status), **Invite** (e-mail + role → an `AllowedEmail` row; the sign-in hook
  accepts an address when it is in the env allow-list *or* an active `AllowedEmail` row; an
  invitation e-mail with the sign-in link is sent when SMTP is configured, otherwise the link is
  shown to copy), change role, deactivate (sessions revoked, sign-in refused, rows kept for the
  audit trail), reactivate. `AUTH_ALLOWED_EMAILS` keeps working as the bootstrap list.
- **API keys** (E) inherit the creator's ceiling: a VIEWER can only mint read scopes, an EDITOR
  can mint read and create scopes but never OWNER-only ones; keys are deactivated with their user.
- Audit: `user.invited`, `user.role_changed`, `user.deactivated`, `user.reactivated`; every audit
  event already records the actor and now also the actor's role.
- Tests: integration role matrix (every mutating DAL function × three roles), last-owner guard,
  invitation accepted through the sign-in hook; e2e: a VIEWER sees no "New invoice" and gets
  403 pages on settings.

## 9c. Sub-project I - Translated documents and non-Latin fonts

Added to scope. Depends on F (catalogues) and C (template/font work).

- **Document language:** `Invoice.documentLocale` and `CreditNote.documentLocale` (BCP-47,
  snapshot at issue). Default order: the client's new `preferredLocale`, else the issuer
  profile's `locale`, else `en-US`. The builder's display options get a "Document language"
  select over the same 115-entry list as the UI picker.
- **Strings:** the catalogues gain a `documents` namespace with the 29 `LABEL_KEYS`, the
  automatic titles (TAX INVOICE, BILL OF SUPPLY, INVOICE, CREDIT NOTE), "Page {n} of {total}",
  "Amount in words", "Original for recipient" and the void/draft watermarks. Template `labels`
  overrides typed by the owner still win. Dates and numbers in the document follow the document
  locale (Indian digit grouping for `en-IN`/`hi`, symbol placement per locale).
- **Amount in words** stays English (international or Indian system by region); other locales
  print the English words under a localised label. Stated in the UI and SPEC.
- **Fonts by script:** `src/lib/documents/fonts/scripts.ts` maps Unicode ranges to scripts and
  scripts to a Noto family: Devanagari, Bengali, Gurmukhi, Gujarati, Oriya, Tamil, Telugu,
  Kannada, Malayalam, Sinhala, Thai, Lao, Myanmar, Khmer, Arabic (also Persian, Urdu, Pashto,
  Kurdish Sorani), Hebrew, Georgian, Armenian, Ethiopic, Greek and Cyrillic (Noto Sans covers
  both), Han/Kana/Hangul (Noto Sans SC/TC/JP/KR). Indic, Arabic, Hebrew, Thai, Lao, Myanmar,
  Khmer, Georgian, Armenian, Ethiopic and Sinhala come from `@fontsource/noto-sans-<script>`
  static WOFF files; the four CJK families are whole variable TTFs fetched by the vendor script
  from `github.com/google/fonts` at a pinned commit (the Fontsource CJK packages are split into
  unicode-range slices the PDF renderer cannot use). CJK renders in the regular weight only.
- **Rendering:** a `<RunText>` helper splits every document string into script runs and nests
  `<Text style={{ fontFamily }}>` per run, so mixed Latin/Devanagari lines render; react-pdf's
  text engine does the OpenType shaping (fontkit) and bidi. RTL document locales set the
  paragraph direction and right-align the table text columns.
- Preview: `document-fonts.css` gains the same Noto faces so the HTML twin matches.
- Tests: unit script detection and run splitting; render tests for Hindi, Arabic (RTL), Chinese
  and mixed strings assert the PDF text layer round-trips through `pdf-parse`; snapshot of the
  `documents` namespace keys per locale.

## 9d. Sub-project J - DOCX output

Added to scope. Depends on C (templates) and I (document language).

- `docx` (MIT) builds a Word document from the same `DocumentViewModel` and template config:
  paper and margins, heading/body font family names (Word substitutes when missing), accent and
  text colours, header band colour (images are placed as pictures), logo, parties, items table,
  totals, notes, terms, payment details, QR image, page numbers. The label sources (locale
  catalogue, template overrides) apply exactly as in the PDF.
- Stored as `Document` rows with `format = DOCX`, versioned and hashed like PDFs (DOCX output is
  not byte-stable across runs, so the "adopt identical blob" rule does not apply to it); listed
  on the verify page.
- Entry points: "Download DOCX" on the invoice and credit-note pages, `GET /api/v1/…/{id}/docx`
  (`documents:read`), the documents ZIP export gains `formats=pdf,docx`, and e-mail attachments
  can pick DOCX.
- Not encrypted and never used for e-invoicing or sharing.
- Tests: unit (the generated package's `word/document.xml` contains the number, every line
  description, the totals and the localised labels), integration (version rows and hashes),
  e2e download.

## 9e. Sub-project K - E-invoicing

Added to scope. Depends on C (products/HSN), H (settings role) and I (locale). Three outputs
share one `src/lib/einvoice/` module built from the issued invoice's snapshot (never from live
rows), plus connectors.

- **India (GST e-invoice, INV-01 schema v1.1):** `toGstEInvoice(invoice)` builds the JSON
  (`Version`, `TranDtls`, `DocDtls`, `SellerDtls`, `BuyerDtls`, `ItemList`, `ValDtls`, optional
  `ExpDtls` for exports under LUT) with a Zod schema mirroring the IRP's rules (GSTIN and PAN
  patterns, 6-digit PIN, HSN 4-8 digits, state codes, totals reconciliation). "Download
  e-invoice JSON" works for every issued invoice whose issuer has a GSTIN. **IRN registration**
  goes through an `IrpConnector` interface: `manual` (the owner pastes or uploads the IRP's
  response: `Irn`, `AckNo`, `AckDt`, `SignedQRCode`, `SignedInvoice`) and `nic` (the NIC IRP
  REST API, sandbox and production base URLs, GSP credentials encrypted at rest; auth, generate,
  cancel). The NIC connector is implemented against the published protocol and tested with
  recorded fixtures only; it is marked *unverified against a live sandbox* until the owner
  supplies sandbox credentials. On success the invoice stores `einvoice.{irn, ackNo, ackDate,
  signedQr, status}`; the PDF prints "IRN", the Ack no/date and the **signed QR** (decoded from
  the `SignedQRCode` JWT payload) in place of the okinvo QR; cancellation within 24 h records the
  reason and prints "Cancelled". Status pill on the invoice page; the register gets an
  "e-invoice" filter.
- **EU (Factur-X / ZUGFeRD 2.3, profile EN 16931):** `toCii(invoice)` builds the CII XML
  (`rsm:CrossIndustryInvoice`) with `xmlbuilder2`, deterministic ordering; `toFacturX(pdf, xml)`
  turns the canonical PDF into a **PDF/A-3b** file with `pdf-lib`: embeds `factur-x.xml`
  (`AFRelationship /Alternative`, MIME `text/xml`), writes the XMP packet (`pdfaid:part 3`,
  `pdfaid:conformance B`, the Factur-X schema extension with `fx:ConformanceLevel EN 16931`),
  adds an sRGB OutputIntent (ICC profile vendored under `src/lib/einvoice/icc/`), sets the
  document ID and metadata. Stored as a `Document` with `format = PDF_A3` (enum extended),
  versioned and hashed. Validation: an integration test runs veraPDF (`verapdf/cli` container,
  PDF/A-3b profile) and skips when Docker is absent; CI runs it.
- **UBL 2.1 (Peppol BIS Billing 3.0):** `toUbl(invoice)` for every invoice (download only; no
  access-point integration). Tax category codes (S, Z, E, AE, K, G, O) are derived from the
  regime, rate, exempt flag and reverse charge; unit codes map UN/ECE Rec 20 (HOUR→HUR,
  DAY→DAY, FIXED/UNIT/MILESTONE→C62); payment means from the invoice's payment-method snapshot
  (IBAN/BIC, UPI as a text instruction).
- **Data additions:** `Client.buyerReference`, `Client.electronicAddress` + `scheme` (Peppol
  EAS), `Client.preferredLocale` (from I); `IssuerProfile.electronicAddress` + `scheme`;
  `Invoice.einvoice Json?` (Zod `EInvoiceStateSchema`). Settings → **E-invoicing** (OWNER):
  per-profile enablement, EU identifiers, India connector selection and credentials.
- Credit notes: CII/UBL credit-note variants (`TypeCode 381`) and the GST e-invoice `CRN`
  document type use the same builders.
- Tests: golden fixtures for the GST JSON, CII and UBL of the standard test invoice (compared
  after canonicalisation), schema rejection cases (bad GSTIN, missing PIN, HSN length), signed-QR
  decoding from a fixture JWT, Factur-X structure (attachment, XMP, OutputIntent) + veraPDF, NIC
  connector request/response round-trip with recorded fixtures, manual connector happy path.

## 10. Decisions (defaults confirmed by the owner on 2026-10-02)

1. **Translation scope.** Default: all 115 languages selectable; `en-US`/`en-GB` hand-written,
   113 machine-generated and labelled as such (≈ 800 strings × 113 ≈ 90 000 strings; roughly
   2-3 M generated tokens; low-resource languages such as Inuktitut, Iñupiatun or Fula will be
   rough). Alternative: hand-quality catalogues for ~30 widely used languages now and the rest
   falling back to English until contributed.
2. **License.** Default Apache-2.0 (patent grant, permissive, standard for self-hosted apps).
   Alternatives: MIT (shorter), AGPL-3.0 (copyleft; forces hosted forks to publish changes).
3. **Default accent.** Default Mint (`#87D9A8`, the logo's dot). Alternative: keep Lavender.
4. **Wiki.js.** Default: optional Compose profile on `docs.<domain>` plus in-repo markdown.
   Alternative: in-repo markdown only (no Wiki.js container).
5. **PDF accessibility flag.** Default: screen-reader text extraction stays allowed
   (`contentAccessibility: true`); printing, copying, editing, forms, annotations and assembly
   are restricted as requested. Alternative: restrict accessibility too.
6. **Onboarding e-mail field.** Default: read-only (it is the sign-in identity). Alternative:
   editable with a verification mail (needs SMTP at first run).
7. **API and MCP write scope.** Default: create and issue invoices and credit notes only. No
   void, payments, deletes or settings through keys or MCP.
8. **PDF language.** Default: PDFs keep the profile locale and Latin fonts; only the UI is
   translated.

---

## 11. Beyond this branch - what else would make okinvo polished, secure and compliant

Not scheduled; listed so the owner can pick the next branch.

**Compliance and finance**
- India e-invoicing (IRP/IRN with signed QR) and GST return exports (GSTR-1 JSON); EU Factur-X /
  ZUGFeRD (PDF/A-3 with embedded XML) and Peppol UBL for B2G; UK Making Tax Digital CSV.
- PDF/A-3 archival output and PAdES digital signatures (owner's X.509 or Indian Class 3 DSC).
- Gap-free numbering report and a sealed, hash-chained audit log export per fiscal year.
- Quotes/estimates that convert to invoices; recurring invoices; payment reminders with
  templates; late fees; partial-payment plans; multi-currency statements per client.
- Expense capture against receipts; profit summary per fiscal year.

**Security**
- Passkeys/WebAuthn and TOTP second factor through Better Auth plugins; session device names.
- Signed container images (cosign) and an SBOM (Syft) published with each release; Trivy on the
  SBOM.
- CSP violation reporting endpoint; Subresource Integrity for any external asset (there are none).
- Encryption key rotation tooling for `FIELD_ENCRYPTION_KEY`; encrypted backups (age).
- Scoped, expiring share links with one-time passwords sent by e-mail.

**Product**
- Client portal (per-client magic link: statements, open invoices, downloads).
- Payment links (Razorpay, Stripe) as an optional, self-configured integration.
- Webhooks for issued/paid events; Zapier-style automation through the API.
- Keyboard-first command palette (`⌘K`), bulk actions, duplicate invoice, saved views.
- Import from `data.json` and from common CSV layouts; migration from other tools.
- PWA install with offline read-only access to issued documents.
- Accessibility audit in CI (axe-core in Playwright) and WCAG 2.2 AA statement.
- Viewer role (planned v1.1) and team accounts with SSO.

---

## 12. Documents to update alongside the code

| Document | Change |
|---|---|
| `CLAUDE.md` | public exceptions add `/i/*`, `/legal/*`, `/api/openapi.json`, `/api/mcp` (key-authenticated); accent rule wording; `todayIn(actor.timezone)`; layout rows for `src/lib/i18n`, `src/lib/api`, `src/components/shell`, `sdk/`, `skills/`, `docs/wiki/` |
| `SPEC.md` | §4.8 products and SKUs; §4.10 share links and protected PDFs; §6 exports (products dataset, SKU column); §7 API/MCP; template list and header block |
| `IMPLEMENTATION_PLAN_v2.md` | §22 roadmap moved; §24 shell (collapsible rail, drawer), accents, avatars |
| `DESIGN.md` / `DESIGN.light.md` | `accents:` block, brand dot token, avatar and sheet component specs |
| `README.md`, `docs/changelog.md` | rewritten / entries per sub-project |
| `k8s/README.md`, `compose.yml` | `docs` profile and build args |

---

## 13. Non-goals in this branch

Publishing the SDK to npm; the e-mail change flow; payment integrations; a hosted okinvo service;
Peppol access-point delivery; live NIC sandbox verification until the owner supplies credentials.
