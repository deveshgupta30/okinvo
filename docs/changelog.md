# Changelog

Milestones of okinvo v1.0 (`IMPLEMENTATION_PLAN_v2.md` §22). Dates are when the milestone's tests
went green on the development branch.

## v1.1 (in progress, 2026-10-03)

- Shell & identity: brand marks and favicons, selectable pastel accents (mint default), avatars with
  a circular crop, collapsible sidebar with an icon rail, mobile drawer, theme toggle and user menu
  in the sidebar footer, dashboard greeting, Settings → Appearance, phone layouts.
- Onboarding: three-step first-run wizard (country guessed from the browser, GSTIN / UK VAT check
  digits) that prefills the first issuer profile; Account region, currency and language.
- Roles: EDITOR role, `requireRole` guards across DAL, pages, actions and API; Settings → Users with
  invitations (allow-list rows), role changes, deactivation; role-aware navigation and exports.
- Catalogue: products with SKUs, printed on documents and exported; services and products tagged
  to issuer profiles, with the builder picker following the selected issuer.
- Templates: heading and body fonts chosen from a 100-family Google font catalogue vendored from
  Fontsource (`pnpm fonts:vendor`); Minimal, Letterhead and Modern templates; a header band or
  uploaded image with opacity and height across every page.
- Input charset: every text field, on the client and at every server boundary, accepts only
  standard keyboard characters (SPEC §6.6).
- Share links: public `/i/<token>` viewer with an optional password gate (generated passphrase
  or your own), expiry, revocation, view and download counts, rate limits and audit; a protected
  link only ever serves its own protected copy.
- Protected copies: AES-256 password-protected PDF versions (open + print only) with an EFF
  passphrase generator and a password strength hint.
- Documents: wider description column, tax rate under the tax amount, totals never split across
  pages, section titles kept with their text, the page footer restored on every page (react-pdf
  drops a bottom-anchored fixed box holding a page-number text), and an approximate page count
  on the live preview.

## Review follow-ups (2026-10-02)

- Whole-branch review fixes: row locks on the issue, void, payment and credit-note
  transactions; password sign-up only for addresses listed exactly; number formats need a year
  token; orphaned PDFs adopted; no void while a credit note is issued; dashboard scoped to the
  base currency.
- Secrets at rest: verification tokens stored as SHA-256 hashes (encrypted copy for links),
  payment-method snapshots encrypted, Zod on every snapshot read, DAL role checks ahead of the
  Viewer role, and JWT API tokens (`/api/auth/token`, `/api/auth/jwks`, `Authorization: Bearer`).
- Rules: overdue outranks partially paid; line bounds and zero-decimal rounding; UK VAT exempt
  lines; payments and credit notes not before the invoice; exchange rate required for a
  foreign-currency invoice; archived parties cannot be invoiced; a final credit note absorbs the
  invoice's rounding; "received" counts cash only.
- Exports: guard catches leading whitespace and full-width symbols; names frozen at issue; GSTIN
  fallback in the GST summary; a wrong fiscal-year label is an error; CSVs stream inside the
  all-data ZIP; uploads refuse an oversized body up front.
- Ops: backup containers get only the database variables; release script checks untracked files
  and existing tags and scans both images; NetworkPolicy allows in-cluster identity providers
  and relays; the SeaweedFS overlay is marked experimental. The runtime and migration images
  ship no npm, npx, corepack or yarn (Trivy flagged npm's bundled dependencies), and the restore
  drill removes root-owned backup files through a container so cleanup cannot fail a passed run.
- "New credit note" from the dashboard and the register, with an invoice picker.

## M4 — Exports, data and polish (2026-10-01)

- Eight CSV/XLSX datasets (invoices register, line items, payments ledger, credit notes, clients,
  services, GST summary, TDS summary) with cursor pagination, formula-injection guard, typed
  Excel cells and a `Filters` sheet; Export menu on every index page.
- Settings → Data: "export all data" ZIP (CSV + `data.json` + README), "export documents" ZIP
  (PDFs by number + `index.csv`, missing PDFs rendered on the way), dataset table with a period and
  issuer applied, backup status and instructions.
- Backup service (`docker/backup`): nightly `pg_dump` + storage tarball with retention; restore
  script; `scripts/restore-drill.sh` run in CI (seed → backup → wipe → restore → verify).
- `classic` and `compact` templates, full template customisation with import/export and a
  per-profile override (landed in M2's follow-up).
- Client page lifetime totals; error, not-found and forbidden pages; Enter in a line item adds the
  next line instead of submitting the form.

## M3 — Money in, mail out (2026-10-01)

- Payments ledger with running balance, TDS, FX, bank fees, receipts, write-offs and refunds;
  balances recalculated in the same transaction; derived statuses (sent, partially paid, paid,
  overdue).
- Amount-based credit notes with tax apportioned within each tax type, their own sequence, caps
  against the invoice's outstanding taxable amount and balance, void, PDF and verification.
- Dashboard: outstanding and overdue per currency, billed and received this fiscal year in the
  base currency, drafts, recent invoices, top clients.
- Email: SMTP from Settings or environment, composer with the stored PDF attached, mail-app
  fallback with "mark as sent", sent log, test email, invoice history page; Mailpit in
  `compose.dev.yml`.

## M2 — Invoices (2026-10-01)

- Builder with catalogue and ad hoc lines, discounts, rounding, live preview from the same pure
  modules the server uses.
- Tax engine for India GST (intra/inter-state, export under LUT, reverse charge), UK VAT, US sales
  tax and none, rounded half-up at the currency's minor units per line and component.
- Issue transaction: validation, snapshots of issuer, client, payment methods and template,
  number allocation with `INSERT … ON CONFLICT … RETURNING` (safe under concurrency), PDF render
  and storage, verification token and QR; void and void-and-reissue.
- Register with fiscal-year, date, issuer, client, status and currency filters; public
  verification page with hash list and browser-side hash check.

## M1 — Identity and master data (2026-10-01)

- Better Auth with an allow-list enforced at user creation, GitHub, Google, Microsoft, Apple and
  generic OIDC providers, optional password sign-in for environments without an IdP; sessions page;
  account settings (name, timezone, theme).
- Issuer profiles (individual and company, uploads for logo, signature and stamp, encrypted US tax
  id), clients, service catalogue, payment methods with encrypted details; archive instead of
  delete; audit log viewer.

## M0 — Scaffold (2026-09-30)

- Repo tooling (pnpm, TypeScript 6, ESLint, Prettier, Vitest, Playwright), design tokens generated
  from `DESIGN.md`, Next 16 app shell, Prisma 7 schema and first migration, validated environment,
  Dockerfile and Compose stack, CI, Renovate.
