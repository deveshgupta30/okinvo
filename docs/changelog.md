# Changelog

Milestones of okinvo v1.0 (`IMPLEMENTATION_PLAN_v2.md` §22). Dates are when the milestone's tests
went green on the development branch.

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
