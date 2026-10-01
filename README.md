# okinvo

Self-hosted invoicing for one freelancer or contractor: issuer profiles (individual and company), clients, service catalogue, immutable numbered invoices with PDF + QR verification, payments ledger with TDS, credit notes, CSV/XLSX exports, email sending, and settings-level document templates. Everything runs on your own Docker host or Kubernetes cluster.

## Docs

| | |
|---|---|
| `SPEC.md` | What it does — the product rules |
| `IMPLEMENTATION_PLAN_v2.md` | How it is built — stack, schema, infra, CI |
| `DESIGN.md` / `DESIGN.light.md` | UI design tokens (dark canonical, light overrides) |
| `CLAUDE.md` | Working conventions |
| `docs/superpowers/plans/` | Milestone execution plans |

## Develop

```bash
nvm use 24.21.0                 # or fnm use — see .node-version
pnpm install
cp .env.example .env && scripts/gen-secrets.sh >> .env    # then delete the two placeholder secret lines
pnpm db:up                      # Postgres 18 in Docker Desktop (compose.dev.yml)
pnpm db:generate && pnpm db:migrate
pnpm dev                        # http://localhost:3000
```

Checks: `pnpm lint`, `pnpm typecheck`, `pnpm format:check`, `pnpm test`, `pnpm test:e2e`, `pnpm design:lint`, `pnpm design:tokens --check`.

## Run (Docker Compose)

```bash
cp .env.example .env && scripts/gen-secrets.sh >> .env    # then delete the two placeholder secret lines
# edit: APP_DOMAIN, APP_URL, AUTH_ALLOWED_EMAILS and one AUTH_* provider pair
#       (compose derives NODE_ENV, TRUST_PROXY, STORAGE_LOCAL_ROOT and DATABASE_URL itself)
docker compose up -d --build    # migrate → app → caddy (automatic TLS; internal CA for localhost)
```

If something on your machine already owns ports 80/443, serve on another port with a local
`compose.override.yml` (auto-applied, keep it out of git):

```yaml
services:
  caddy:
    environment: { APP_DOMAIN: "localhost:8443" }
    ports: !override ["8443:8443"]
```

and set `APP_URL=https://localhost:8443` in `.env`. Your browser will warn once about Caddy's
local CA certificate — accept it for `localhost`.

## Using okinvo

1. **Sign in.** Only addresses on `AUTH_ALLOWED_EMAILS` can sign in, through an identity
   provider or, with `AUTH_PASSWORD_SIGNIN=true`, a password. Every allow-listed account is an
   owner. A password sign-up is accepted only for an address listed exactly (a `*@domain` pattern
   admits provider sign-ins, not password sign-ups), so list your own address and create it right
   after deploying. Your timezone is detected on the first page and can be changed in
   Settings → Account.
2. **Set up an issuer profile** (Settings → Profiles): legal name, address, GSTIN/PAN or VAT
   number, base currency, fiscal-year start, number formats such as `INV/{FY}/{SEQ:3}`, logo,
   signature and stamp. Add the **payment methods** (Settings → Payment methods) that should print
   on invoices; their details are encrypted at rest.
3. **Add clients and services.** Clients carry the tax id, state (for GST place of supply),
   currency and payment terms; services are the catalogue the builder picks from.
4. **Build an invoice** (Invoices → New): pick the issuer and client, add catalogue or ad hoc
   lines (Enter moves to the next line), discounts and rounding, watch the live preview, then
   **Issue**. Issuing allocates the number, freezes a snapshot of everything on the page, renders
   the PDF and creates the verification QR. Issued invoices never change: fix a mistake with
   **Void** or **Void and reissue**.
5. **Send it**: the composer (Send) attaches the stored PDF and mails it through the SMTP server
   from Settings → Email, or hands off to your mail app and lets you mark it as sent.
6. **Record payments** on the invoice (amount, TDS withheld, FX received, bank fees, receipt);
   statuses — sent, partially paid, paid, overdue — follow from the ledger and the due date.
   Raise a **credit note** against an issued invoice when part of it is cancelled.
7. **Reports and hand-offs**: every register has an Export menu (CSV or Excel with the page's
   filters); Settings → Data offers the GST and TDS summaries, the full-data ZIP and the
   documents ZIP for your accountant.
8. **Backups**: the Compose `backup` service dumps the database and the storage volume nightly
   (`BACKUP_CRON`, `BACKUP_RETENTION_DAYS`); Settings → Data shows the last run. Restore with
   `docker compose run --rm backup /backup/restore.sh <dump> <storage.tgz>` after stopping the
   app. `scripts/restore-drill.sh` proves the procedure in CI.

The verification page `/verify/<token>` behind each QR shows the issuer, client, dates, total and
the SHA-256 of every stored PDF version, so a recipient can check an invoice without signing in.

Status: M0–M4 delivered (`docs/changelog.md`); M5 (hardening, release script, Kustomize) in
progress — see `IMPLEMENTATION_PLAN_v2.md` §22.
