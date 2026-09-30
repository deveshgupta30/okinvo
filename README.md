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
cp .env.example .env && scripts/gen-secrets.sh >> .env
# edit: APP_DOMAIN, APP_URL, NODE_ENV=production, TRUST_PROXY=true,
#       DATABASE_URL=postgresql://okinvo:<POSTGRES_PASSWORD>@postgres:5432/okinvo,
#       STORAGE_LOCAL_ROOT=/data/storage, AUTH_ALLOWED_EMAILS, one AUTH_* provider
docker compose up -d --build    # migrate → app → caddy (automatic TLS; internal CA for localhost)
```

Status: M0 scaffold. Sign-in, invoices and the rest arrive milestone by milestone (`IMPLEMENTATION_PLAN_v2.md` §22).
