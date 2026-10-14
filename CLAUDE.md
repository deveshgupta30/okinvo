# CLAUDE.md - okinvo

Personal project of **deveshgupta30** (`keshav.gupta@hotmail.com`). It is unrelated to any employer or other organisation: do not pull in external company context, knowledge bases, memory or connectors, and do not save anything about this project to memory.

## Read these first

If `MEMORY.md` exists at the repo root (local, gitignored), read it before anything else: it holds machine state, session history and decisions that neither the repo nor git records. Update it at the end of every session; never commit it.

| Doc | Role |
|---|---|
| `SPEC.md` | **What** we build: domain rules (lifecycle, numbering, tax, money, exports). Authoritative for behaviour. |
| `IMPLEMENTATION_PLAN_v2.md` | **How** we build it: stack, schema, auth, storage, Docker/K8s, CI. Current. |
| `IMPLEMENTATION_PLAN.md` | The original v1 plan, kept verbatim for history. **Superseded - do not implement from it.** |
| `DESIGN.md` (+ `DESIGN.light.md` from M0) | UI design tokens in the `design.md` format (Linear-derived dark canvas, single lavender accent); the light file holds the inverse-light overrides under the same token names. Source of truth for colours, type, radius and spacing; `src/app/tokens.css` is generated from both. App mapping, status palette and light values: v2 §24. |

If code and these docs disagree, fix whichever is wrong and say so; don't silently diverge.

## Stack (versions pinned in `IMPLEMENTATION_PLAN_v2.md` §3)

Node 24 LTS · pnpm 10 · Next.js 16 (App Router, `proxy.ts` not `middleware.ts`) · React 19 · TypeScript 6 (strict; TS 7 waits on typescript-eslint) · Prisma 7 with `@prisma/adapter-pg` · PostgreSQL 18 · Better Auth · Tailwind 4 + shadcn/ui · Zod 4 · `@react-pdf/renderer` · `nodemailer` · `exceljs` / `csv-stringify` · Docker Compose (primary) and Kustomize (K8s).

## Non-negotiable rules

- **Money:** `Decimal` (decimal.js / Prisma Decimal) end to end. Never `number` for amounts. Round half-up to the currency's minor units (`roundMoney(v, currency)`, never a bare `toDecimalPlaces(2)`) only at the points `SPEC.md` §4.6 defines. All money math lives in `src/lib/money`.
- **Dates:** document dates are calendar dates handled as `YYYY-MM-DD` strings at every boundary; instants are UTC `Date`s. Never construct a `Date` from a bare `YYYY-MM-DD` string. "Today" is `todayIn(actor.timezone)` (`src/lib/dates.ts`) in the signed-in user's timezone - never the server's.
- **Validation:** Zod at every boundary - env (`src/lib/env.ts`), server actions, route handlers, and every `Json` column (schemas in `src/lib/schemas`).
- **Input charset:** every text field accepts only standard keyboard characters (`src/lib/input-charset.ts`, SPEC §6.6). `parseForm`/`parseObject` enforce it ahead of the schema; a route handler that parses its own input calls `findDisallowed`/`assertKeyboardInput`; new text inputs use the shared `Input`/`Textarea`. Never add a raw SQL statement or a shell call that takes user input.
- **UI text:** every user-visible string in `src/app` and `src/components` comes from the next-intl catalogues (`messages/<locale>.json`, en-US is the source of truth) through `useTranslations` / `getTranslations`; never a bare English literal in JSX, never a locale in the URL. `pnpm i18n:check` guards the catalogues and the keys the code uses. Documents keep the issuer profile's locale (SPEC §8.1).
- **Authorization:** every server action and route handler calls `requireUser()` / `requireOwner()` from `src/server/auth`: the only public exceptions are `/api/health/live|ready`, `/api/openapi.json`, `/verify/*`, the share viewer `/i/*` and the legal pages `/legal/*`, which are public by design (rate-limited, token-gated, never payment data). `/api/v1/*` routes and the MCP server `/api/mcp` call `requireApiActor(scope, request.headers)` (API key or JWT, scopes capped by the user's current role). `proxy.ts` is a convenience redirect, never the security boundary.
- **Roles:** `OWNER`, `EDITOR`, `VIEWER` (`src/server/actor.ts`). The DAL is the boundary: settings functions call `requireRole(actor, "OWNER")`, writes call `requireWriter`, reads need a signed-in actor; pages pass the lowest role that may open them and the UI hides what the role cannot do. At least one active owner must remain.
- **Immutability:** an `ISSUED` invoice or credit note is never updated except for `sentAt`, void fields, payments and credit notes. Enforce in the DAL, not just the UI.
- **Numbering:** only `allocateDocumentNumber()` in `src/lib/numbering` may assign numbers, and only inside the issue transaction.
- **Storage:** all blobs go through `src/lib/storage` (`StorageAdapter`). Store **keys**, never URLs. Nothing in blob storage is publicly reachable; serve via `/api/assets` and `/api/documents`.
- **Secrets & PII:** encrypted fields go through `src/lib/crypto` only. No secrets in the repo, compose files or manifests - env only. `.env.example` is the contract.
- **Exports:** every text cell passes the formula-injection guard in `src/lib/exports/guard.ts`.
- **Soft delete/archive:** use the Prisma client extension in `src/lib/db`; never hand-write `archivedAt: null` filters.
- **Audit:** state-changing DAL functions call `audit()` inside the same transaction.
- **Templates:** issued documents render from the `templateSnapshot` stored on the invoice/credit note, never from current settings. Template config is parameters only: no user markup, CSS or fonts reach the renderer.
- **Derived documents:** the stored PDF is the canonical, verifiable document. DOCX copies, password-protected copies and Factur-X PDF/A-3 copies are their own `Document` rows (own `format`, version sequence and hash) rendered from the same snapshot; they never replace or rewrite the canonical PDF, and only an e-invoice registration regenerates it as a new version.
- **Email:** nothing is sent without an explicit click in the composer; bodies are plain text; attachments only from stored `Document` rows; every attempt is logged in `EmailMessage`.
- **Design:** colours, type, radius and spacing come from `DESIGN.md` through the generated `src/app/tokens.css`: never a hex literal in a component, never edit `tokens.css` by hand. The accent (`primary`: mint by default, one of the eight pastels a user picks under Settings → Appearance, applied as `:root[data-accent]` token overrides from `DESIGN.md`) only for the brand mark, the one primary button per view, focus rings and the active-nav indicator; link text uses the `link` token; never name an accent colour in a component. `shadcn add` may append oklch `:root`/`.dark` blocks to `globals.css`: delete them; the mapping block there is the only source. Status colours only from the status palette (v2 §24.5). Amounts, document numbers and dates use JetBrains Mono (`app-amount` / `app-mono`), amounts right-aligned. Both themes ship: every component must read correctly under `:root` (dark) and `[data-theme="light"]`: never a dark-only colour.

## Layout (planned)

```
src/app            routes (App Router)            src/lib/tax        tax engine per regime
src/components     UI (shadcn-based)              src/lib/numbering  fiscal year + sequences
src/server         DAL, server actions, auth      src/lib/documents  templates + PDF/preview renderers
src/lib/db         Prisma client + extensions     src/lib/exports    datasets, CSV/XLSX writers
src/lib/money      Decimal helpers                src/lib/storage    StorageAdapter + drivers
src/lib/email      SMTP transport, composer       src/lib/format     Intl + amount-in-words
src/lib/schemas    Zod schemas for Json columns   prisma/            schema + migrations
src/lib/i18n       language table, next-intl      messages/          catalogues (en-US is the source)
src/lib/api        v1 handlers, OpenAPI, MCP      src/lib/einvoice   GST JSON, IRP, CII/UBL, Factur-X
src/components/shell  sidebar, drawer, user menu  sdk/               generated TypeScript client
skills/            agent skill (okinvo-invoicing) docs/wiki/         user guide + generated screenshots
docker/            Dockerfile, Caddy, backup      k8s/               Kustomize base + overlays
scripts/           release, backup, restore, docs tests/             unit, integration, e2e
compose.yml        production stack (repo root)   compose.dev.yml    postgres (+s3) for dev and CI
```

## Commands (once scaffolded)

```
pnpm dev · pnpm build · pnpm start
pnpm lint · pnpm typecheck · pnpm format · pnpm format:check
pnpm test · pnpm test:watch · pnpm test:e2e
pnpm db:up · pnpm db:down · pnpm db:generate · pnpm db:migrate · pnpm db:migrate:dev · pnpm db:reset · pnpm db:studio · pnpm db:check · pnpm db:seed
pnpm design:tokens [--check] · pnpm design:lint
pnpm i18n:check · pnpm openapi:export · pnpm sdk:generate · pnpm sdk:check · pnpm notices[:check] · pnpm fonts:vendor · pnpm env:docs[:check]
pnpm docs:seed · pnpm docs:screenshots · pnpm docs:sync      (user guide: demo data, screenshots, Wiki.js publish)
scripts/restore-drill.sh          (backup → wipe → restore against its own "drill" database; runs in CI)
docker compose up -d --build      (M5 adds scripts/release.sh → docker.io/deveshgupta30/okinvo)
```

`next lint` no longer exists in Next 16 - run `eslint` directly.

## Testing expectations

- Unit (Vitest): money, tax engine, numbering, status derivation, balance recalculation, export guard, crypto. These are the bug magnets - test first.
- Integration: DAL against a real Postgres (Docker), especially the issue transaction and concurrent number allocation.
- E2E (Playwright): sign-in → create profile/client → build → issue → download → verify → record payment → credit note → export.
- A change to `SPEC.md` §4.6-4.9 rules requires a matching test change in the same commit.

## Git / delivery

- GitHub `deveshgupta30/okinvo`; images `docker.io/deveshgupta30/okinvo` (local Docker is logged in; releases are built and pushed locally via `scripts/release.sh`, optionally by GitHub Actions if registry secrets are added).
- Conventional commits (`feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`). Branch from `main`; never commit or push unless asked.
- Repo-local git identity is already set to the personal account.
- Pin exact dependency versions; Renovate keeps them current.

## Don'ts

No Redis or other extra infrastructure; no managed cloud services; no `any`; no editing issued documents; no storing URLs; no public buckets; no `'unsafe-inline'` or `'unsafe-eval'` in the production `script-src` (`style-src 'unsafe-inline'` is required by Next and allowed); no adding a dependency without a reason in the commit message.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes - APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` - verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
