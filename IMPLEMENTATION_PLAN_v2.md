# okinvo - Implementation Plan v2

| | |
|---|---|
| **Status** | Current. Supersedes `IMPLEMENTATION_PLAN.md` (v1, kept verbatim for history). |
| **Date** | 2026-09-30 - all versions below were verified against npm, nodejs.org and Docker Hub on this date. |
| **Product rules** | `SPEC.md` is authoritative for behaviour; this document is authoritative for technology and infrastructure. |

---

## 0. What changed from v1 and why

| Area | v1 | v2 | Reason |
|---|---|---|---|
| Access model | Anyone with a Google/GitHub account signs in and becomes `OWNER` | Env allow-list checked *before* user creation; single-tenant | v1 was an open door. |
| Auth library | Auth.js v5 `5.0.0-beta.25` | **Better Auth 1.7** | Auth.js v5 is still `beta.32` after 2+ years; Better Auth is stable, supports Next 16 + Prisma 7, and ships session listing/revocation that `/settings/security` needs. |
| Sessions | JWT (but Redis listed "for sessions") | Database sessions, revocable | Required for the security page; removes the JWT/Redis contradiction. |
| Redis | Rate limiting, "sessions", locks | **Removed** | Nothing needed it. In-memory limiter for one replica; Postgres-backed limiter for many. |
| Blob storage | SeaweedFS mandatory, S3 gateway unauthenticated and published to the internet | `StorageAdapter` with **local-disk driver (default)** and **S3 driver (SeaweedFS, authenticated, internal-only)** | Ten images don't need a distributed FS; when S3 is used it must be private. MinIO community images are gone from Docker Hub, so SeaweedFS stays as the self-hosted S3. |
| Asset URLs | Public `S3_PUBLIC_BASE_URL/bucket/key` stored in DB | Keys stored; served via authenticated app routes | Public signature/stamp URLs are a forgery kit; stored URLs break on domain change. |
| Invoice editing | "Version-aware editing" of issued invoices | Issued = immutable; void & reissue; credit notes | Legal requirement; also simpler. |
| Numbering | `@unique` string, no mechanism | `DocumentSequence` per issuer/kind/FY, allocated at issue in-transaction | Gap-free consecutive numbering (GST Rule 46, UK VAT). |
| Status | Stored `OVERDUE`, `PARTIALLY_PAID`, `SENT`, … | Stored `DRAFT/ISSUED/VOID` + `sentAt`; rest derived | Stored derived state drifts and needs cron. |
| Tax | `taxDetails Json` | `InvoiceTaxLine` rows + `supplyType`; tax engine per regime | Reportable, exportable, testable. |
| TDS | On invoice only | Expected on invoice, actual on payment | TDS is deducted at payment time and is recoverable; fees are not. |
| Sensitive fields | Plaintext | AES-256-GCM for bank details and US tax ID | SSNs and account numbers in plaintext is not acceptable even for one user. |
| Verification token | `cuid()` | 32 random bytes, app-generated | cuid v1 is deprecated as predictable. |
| Migrations | `npx prisma migrate deploy` inside the standalone runner | Dedicated `migrate` image/service/Job | Prisma CLI is not in the standalone output; the runner user can't write to `/app`. |
| Health | One `/api/health` for liveness and readiness | `/api/health/live` (shallow) and `/api/health/ready` (DB) | Shared probe = restart loops when the DB blips. |
| Secrets | Hardcoded in compose and manifests | `.env` / `kubectl create secret` out of band | - |
| Compose | `version: "3.9"`, app and S3 ports published, no proxy | Caddy with automatic TLS in front; nothing else published | Diagram had a proxy, compose didn't. |
| Kubernetes | 2 replicas, `kubectl exec` migrations, deprecated ingress annotation, no NetworkPolicy | 1 replica default, migration `Job`, `ingressClassName`, NetworkPolicy, hardened `securityContext`, backup `CronJob` | Correctness + the "zero-trust" claim now has something behind it. |
| Versions | Jan-2025 pins; Next 15.1.4 (CVE-2025-29927), Node 20 (EOL Apr 2026) | Current LTS/stable, verified 2026-09-30; Renovate | - |
| CSP | `'unsafe-inline' 'unsafe-eval'` | Nonce-based CSP from `proxy.ts` | v1's CSP was decorative. |
| Exports | PDF/DOCX only | **CSV/XLSX for eight datasets + ZIP bundles** (new requirement) | Accountant hand-off; data portability. |
| DOCX | v1 | v1.1 | Halves the rendering surface for the first release. |
| Credit notes | `amount` + `reason`, no tax | Amount + reason with tax lines apportioned pro-rata from the invoice (decided; line items considered and dropped) | Reportable tax without line-item overhead. |
| Timezone | none | Per signed-in user (`User.timezone`), auto-detected, editable in Settings → Account | "Today" belongs to the person clicking, not the issuer or the server. |
| Currencies | implicit 2 dp | Minor-unit aware (0 or 2) via `Intl`; three-decimal currencies rejected | JPY/KRW without a footgun. |
| Email | none | SMTP via env **or** Settings; "Send by email" composer that drafts an editable mail with the stored PDF attached; delivery log; `mailto:` fallback | Requested. |
| Templates | none | Three built-ins chosen and customised in Settings → Templates, optional per-issuer override, snapshotted at issue | Requested; settings-level, never on the invoice form. |
| Design system | "canonical Linear dark/light design tokens" (unspecified) | `DESIGN.md` (design.md format) is the token source; `src/app/tokens.css` is generated from it and linted in CI; dark + AA-verified inverse light + system modes; app mapping in §24 | One lintable source of truth instead of a vibe. |
| API keys | Route promised, no model | Dropped from v1 | - |

---

## 1. Goals and constraints

- **Personal, single-tenant, self-hosted.** Everything - app, database, blob storage, reverse proxy, backups - runs on the owner's Docker host **or** Kubernetes cluster. No managed cloud services of any kind.
- **Finishable.** Prefer fewer moving parts. One app replica is the default; scaling out is supported but not optimised for.
- **Correct where it matters.** Money, tax, numbering and immutability are tested first and hardest.
- **Ship images to `docker.io/deveshgupta30/okinvo`.** Release builds happen on the owner's machine (already logged in) and optionally in GitHub Actions.

---

## 2. Runtime decision - Node, or something else?

You asked whether there is a better option than Node. Honest comparison for *this* product (rich builder UI with live preview, signature pad, pixel-faithful PDF, one user, self-hosted):

| Option | Strengths here | Costs here | Verdict |
|---|---|---|---|
| **Node 24 LTS + Next.js 16** | Best ecosystem for the UI you described (shadcn, react-pdf sharing one view-model between preview and PDF, signature pad), Better Auth, Prisma; one language across the stack. | Image ~180 MB, ~150-250 MB RSS; Next self-hosting has some sharp edges (standalone output, image optimisation). | **Recommended.** Runtime cost is irrelevant at this scale; UI velocity is the bottleneck. |
| **Bun 1.x** as runtime for the same code | Faster installs and cold starts; drop-in for most of this stack. | Next.js production on Bun is not a first-class path; Prisma/`sharp` native modules occasionally lag. | Use for local tooling if you like; **don't** make it the production runtime yet. |
| **Go** (templ + HTMX + `chromedp`/`maroto` for PDF) | ~20 MB static image, ~30 MB RSS, single binary, trivial to self-host. | Live-preview builder, signature pad and PDF fidelity are all significantly more work; two languages once you need any real client-side interaction. | Strongest alternative *if* footprint were the goal. It isn't. |
| **.NET 10** (Blazor + QuestPDF) | QuestPDF is arguably the best invoice-PDF library anywhere; strong typing; Docker story is good. | Blazor Server for the builder is fine but the component ecosystem is thinner; you'd be learning a stack, not shipping. | Good, but only if you already live in .NET. |
| **Elixir / Phoenix LiveView** | LiveView is *made* for live-preview UIs; low memory; ChromicPDF works well. | Smaller ecosystem for auth providers/UI kits; PDF fidelity via headless Chrome only. | Interesting, not better. |

Within Node, Next.js 16 vs. lighter frameworks (TanStack Start, React Router 7): Next's self-hosting quirks are real but well-documented, and its App Router + Server Actions map cleanly onto "every screen is a URL". Stay on Next.

**Decision: Node 24 LTS (Alpine), Next.js 16.** Node 26 becomes LTS in October 2026; bump the base image then (Renovate will propose it).

---

## 3. Stack and versions (verified 2026-09-30)

Pin exact versions in `package.json` + `pnpm-lock.yaml`; this table is the record of what was current at planning time. Renovate keeps it moving.

### 3.1 Runtime and images

| Component | Image / version | Notes |
|---|---|---|
| Node.js | `node:24.21.0-alpine` | Active LTS "Krypton". Node 26.10 is Current; LTS from Oct 2026. Local dev machine has 22.21 - upgrade to 24 (`nvm`/`fnm`). |
| pnpm | `10.34.5` | Installed in the image with `npm i -g pnpm@10.34.5` (Corepack is being removed from Node distributions; don't rely on it). |
| PostgreSQL | `postgres:18.6-alpine` | 18 has native `uuidv7()`; 19 is beta. |
| SeaweedFS (optional S3 driver) | `chrislusf/seaweedfs:4.48` | Released 2026-09-28. |
| Caddy | `caddy:2.11.4-alpine` | Automatic TLS; replaces Nginx/Traefik in compose. |

### 3.2 Application dependencies

| Package | Version | Role |
|---|---|---|
| `next` | `16.3.8` | App Router, Server Actions, `proxy.ts`, `after()`, Turbopack builds |
| `react` / `react-dom` | `19.3.0` | |
| `typescript` | `6.0.3` (M0 outcome) | 7.0.2 was tried first: Next 16 builds and `tsc` are fine on it, but `typescript-eslint 8.71` refuses TS 7.0 (typescript-eslint#10940). Renovate holds `<7` until that lands. |
| `prisma` / `@prisma/client` / `@prisma/adapter-pg` | `7.10.0` | `prisma-client` generator + `pg` driver adapter (no Rust engine). **Do not** take `8.0.0-rc.*`, which is currently tagged `latest` for the CLI package - install `prisma@7.10.0` explicitly. |
| `pg` | `8.23.1` | |
| `better-auth` | `1.7.7` | Social providers + `genericOAuth` plugin + Prisma adapter |
| `zod` | `4.6.5` | |
| `@t3-oss/env-nextjs` | `0.13.11` | *Not used in M0*: plain Zod + `server-only` (`src/lib/env.ts`, lazily validated; eager at boot via `instrumentation.ts`). Adopt when a `NEXT_PUBLIC_*` variable appears. |
| `tailwindcss` / `@tailwindcss/postcss` | `4.3.3` | CSS-first config |
| `radix-ui` | `1.6.7` | Unified package, via shadcn/ui generator |
| `lucide-react` | `1.49.0` | |
| `motion` | `13.4.6` | Successor to `framer-motion`; micro-interactions only |
| `react-hook-form` / `@hookform/resolvers` | `7.89.0` / `5.9.1` | Builder forms |
| `@tanstack/react-table` | `9.2.4` | Registers |
| `decimal.js` | `10.6.0` | Money math (same library Prisma's `Decimal` wraps) |
| `date-fns` / `@date-fns/tz` | `4.4.0` / `1.5.0` | Calendar-date helpers; timezone-aware "today" |
| `@react-pdf/renderer` | `4.9.0` | PDF |
| `@fontsource/inter` / `@fontsource/noto-sans` | `5.3.0` | Embedded fonts (Noto guarantees `₹`) |
| `@fontsource/<family>` ×100 | `5.3.0` | Document font catalogue (`src/lib/documents/fonts/catalog.ts`), vendored into `public/fonts` by `pnpm fonts:vendor` |
| `@fontsource-variable/inter` / `@fontsource/jetbrains-mono` | `5.3.0` | UI fonts - DESIGN.md's own recommended substitutes for Linear Display/Text/Mono; mono carries amounts, numbers and dates |
| `nodemailer` | `10.0.13` | SMTP transport (ships its own types) |
| `qrcode` | `1.5.4` | QR as SVG for PDF and preview |
| `signature_pad` | `5.1.4` | Direct use; `react-signature-canvas` is an unmaintained wrapper |
| `sharp` | `0.35.5` | Upload normalisation, EXIF strip, resize |
| `file-type` | `22.1.1` | Magic-byte MIME sniffing |
| `exceljs` | `4.4.0` | XLSX streaming writer |
| `csv-stringify` | `6.9.0` | CSV streaming |
| `archiver` | `8.0.0` | ZIP bundles - ESM-only since 8.0: `new ZipArchive()` instead of the `archiver("zip")` factory |
| `@aws-sdk/client-s3` | `3.1143.0` | S3 driver only (lazy-loaded) |
| `nanoid` | `6.0.1` | Storage key suffixes |
| `pino` | `10.3.1` | Structured logs |
| `docx` | `9.8.1` | v1.1 |

### 3.3 Tooling

| Package | Version |
|---|---|
| `vitest` | `5.0.3` |
| `@playwright/test` | `1.63.0` |
| `eslint` / `typescript-eslint` | `9.39.5` / `8.71.0` - ESLint 10 was tried first; `eslint-config-next 16.3.8` depends on `eslint-plugin-react ^7.37`, whose peer range ends at eslint 9 and which calls the removed `context.getFilename`. Renovate holds `<10`. |
| `prettier` | `3.9.9` |
| `jszip` (dev) | `3.10.2` | Reads ZIP bundles back in tests; the version exceljs already pulls in |
| `@types/node` | `24.x` (match the runtime major, not `26.6.3`) |
| `pdf-parse` | `2.4.5` (document tests only) |
| `@google/design.md` | `0.4.0` - lints `DESIGN.md` (`npx @google/design.md lint DESIGN.md`) |
| `drizzle-orm` (not used) | `0.45.3` - recorded only because it is the alternative if Prisma's lack of partial-index / `FOR UPDATE` support becomes irritating; see §23 |

---

## 4. Architecture

### 4.1 Docker Compose topology (primary)

```
                     Internet
                        │ :443 / :80 (only published ports)
                ┌───────▼────────┐
                │     caddy      │  TLS (Let's Encrypt or internal CA), HSTS,
                │  2.11.4-alpine │  gzip/zstd, request body limit, access log
                └───────┬────────┘
                        │ okinvo-web (internal)
                ┌───────▼────────┐        ┌────────────────┐
                │      app       │        │    migrate     │  one-shot, runs
                │ Next.js :3000  │◀──────▶│ prisma migrate │  before app starts
                │ non-root       │  waits │ deploy         │
                └──┬─────────┬───┘        └───────┬────────┘
                   │         │                    │
        okinvo-data (internal, no egress)         │
                   │         │                    │
        ┌──────────▼──┐   ┌──▼────────────┐   ┌───▼──────────┐
        │  postgres   │   │ app_data vol  │   │   backup     │  nightly pg_dump +
        │ 18.6-alpine │   │ (local driver)│   │  (postgres   │  tar of app_data
        └─────────────┘   └───────────────┘   │   image+cron)│  → backups vol
                                              └──────────────┘
        ┌─────────────┐
        │  seaweedfs  │  optional, `--profile s3`, authenticated S3 on the
        │    4.48     │  internal network only; used when STORAGE_DRIVER=s3
        └─────────────┘
```

Identity providers (Google, GitHub, Keycloak, Casdoor, OIDC) are external to the deployment and reached over HTTPS from `app`.

### 4.2 Kubernetes topology

Same services as Kustomize resources in namespace `okinvo`: `Ingress` (any controller, `ingressClassName`) → `Service` → `Deployment app` (1 replica, with a `migrate` init container) ; `StatefulSet postgres` ; `CronJob backup` ; optional `StatefulSet seaweedfs` overlay ; `NetworkPolicy` default-deny with explicit allows. Details in §17.

### 4.3 Request flow

1. Caddy terminates TLS, sets `X-Forwarded-*`, enforces 25 MB body limit.
2. `proxy.ts` generates a CSP nonce, redirects unauthenticated page requests to `/auth/sign-in` (convenience only).
3. Route/Server Action → `requireOwner()` (real boundary) → Zod-validated input → DAL function (transaction + audit) → Prisma via `pg` adapter.
4. Documents: issue transaction commits → `after()` renders PDF → `StorageAdapter.put` → `Document` row with SHA-256.
5. Downloads: `/api/documents/[id]` and `/api/assets/[...key]` check auth, stream from the adapter with `Content-Disposition`, `Cache-Control: private, no-store`.

---

## 5. Project layout

```
okinvo/
├── src/
│   ├── app/                      # routes; (app)/ authenticated group, (public)/ for /verify and /auth
│   │   ├── (app)/…               # dashboard, invoices, clients, services, credit-notes, settings
│   │   ├── (public)/verify/[token]/page.tsx
│   │   ├── api/auth/[...all]/route.ts
│   │   ├── api/uploads/route.ts
│   │   ├── api/assets/[...key]/route.ts
│   │   ├── api/documents/[id]/route.ts
│   │   ├── api/documents/preview/route.ts   # watermarked draft or template sample
│   │   ├── api/exports/[dataset]/route.ts
│   │   ├── api/health/{live,ready}/route.ts
│   │   ├── globals.css           # Tailwind 4 entry: imports tokens.css, defines shadcn semantic vars (§24.3)
│   │   └── tokens.css            # GENERATED from DESIGN.md by scripts/design-tokens.ts - never edited by hand
│   ├── components/               # shadcn/ui primitives + domain components (InvoicePreview, LineItemsEditor…)
│   ├── server/                   # server-only: auth helpers, DAL (one module per aggregate), server actions
│   │   ├── auth.ts               # requireUser / requireOwner
│   │   ├── dal/{invoices,credit-notes,payments,clients,services,profiles,payment-methods,audit}.ts
│   │   └── actions/…             # thin: validate → call DAL → revalidate
│   ├── lib/
│   │   ├── env.ts                # @t3-oss/env-nextjs schema
│   │   ├── db.ts                 # PrismaClient + adapter + archive-filter extension
│   │   ├── money/                # Decimal helpers, rounding, apportionment
│   │   ├── tax/                  # engine.ts + india-gst.ts, uk-vat.ts, us-sales-tax.ts, none.ts
│   │   ├── numbering/            # fiscalYear.ts, format.ts, allocate.ts
│   │   ├── invoices/             # totals.ts, status.ts, balances.ts, snapshots.ts
│   │   ├── documents/            # view-model.ts, fonts.ts, template-config.ts, templates/{_shared,ledger,classic,compact}/{Pdf.tsx,Preview.tsx}
│   │   ├── email/                # transport.ts (settings|env), templates.ts (placeholders), send.ts
│   │   ├── exports/              # datasets/*.ts, writers/{csv,xlsx,zip}.ts, guard.ts
│   │   ├── storage/              # adapter.ts, local.ts, s3.ts, keys.ts
│   │   ├── uploads/              # validate.ts (size, magic bytes), image.ts (sharp pipeline)
│   │   ├── crypto/               # aes-gcm field encryption, token generation, sha256 streams
│   │   ├── format/               # Intl number/date/currency, amount-in-words (en-IN / en)
│   │   ├── rate-limit/           # memory.ts, postgres.ts, index.ts
│   │   ├── schemas/              # Zod: address, displayConfig, paymentMethodDetails, snapshots
│   │   └── logger.ts
│   ├── generated/prisma/         # Prisma 7 generated client (gitignored)
│   └── proxy.ts                  # Next 16 proxy: CSP nonce, auth redirect
├── prisma/
│   ├── schema.prisma
│   ├── migrations/               # includes hand-written SQL for partial unique indexes
│   └── seed.ts                   # dev-only sample data
├── prisma.config.ts
├── compose.yml                   # production stack - run from the repo root: `docker compose up -d`
├── compose.dev.yml               # postgres (+ seaweedfs) only, for `pnpm dev` and CI
├── docker/
│   ├── Dockerfile
│   ├── Caddyfile
│   ├── seaweedfs/s3.json.example
│   └── backup/{backup.sh,restore.sh}
├── k8s/
│   ├── base/                     # namespace, configmap, app, postgres, migrate-job, backup-cronjob, networkpolicy, ingress
│   └── overlays/{compose-parity,with-seaweedfs}/
├── scripts/
│   ├── release.sh                # buildx multi-arch → docker.io/deveshgupta30/okinvo
│   ├── gen-secrets.sh            # AUTH_SECRET, FIELD_ENCRYPTION_KEY, POSTGRES_PASSWORD
│   ├── design-tokens.ts          # DESIGN.md front matter → src/app/tokens.css; `--check` fails CI when stale
│   └── restore.sh
├── tests/{unit,integration,e2e}/
├── .github/workflows/{ci.yml,release.yml}
├── .env.example
├── renovate.json
├── DESIGN.md                     # UI design tokens (design.md format), dark = canonical - see §24
├── DESIGN.light.md               # light-theme overrides, same token names (schema has no modes) - created at M0
├── SPEC.md · IMPLEMENTATION_PLAN.md · IMPLEMENTATION_PLAN_v2.md · CLAUDE.md
```

---

## 6. Route map

As in `SPEC.md` §5. Implementation notes:

- `(app)` layout calls `requireUser()` once and renders the shell; individual pages still call the DAL, which re-checks (cheap: session is cached per request).
- `/invoices/[id]/edit` for an `ISSUED` invoice redirects to `/invoices/[id]` with a toast explaining void-and-reissue.
- `/verify/[token]` is in the `(public)` group, statically shaped, `robots: noindex`, and never reveals whether a token *almost* matched.

---

## 7. Data model

### 7.1 Conventions

- IDs: `String @id @default(uuid(7))` (time-ordered, index-friendly). Fallback if unsupported by the generator: `@default(dbgenerated("uuidv7()")) @db.Uuid` on Postgres 18.
- Money: `Decimal @db.Decimal(14, 2)`; rates `Decimal(5, 2)`; FX `Decimal(18, 8)`; quantities `Decimal(12, 3)`.
- Calendar dates: `DateTime @db.Date`, read/written as `YYYY-MM-DD` strings through a Prisma result extension.
- Archiving instead of deletion for master data (`archivedAt`). Drafts are hard-deleted; issued documents are never deleted.
- Every `Json` column has a Zod schema in `src/lib/schemas` and is validated on write and parsed on read.
- Encrypted columns are suffixed `Enc` and hold `v1.<iv>.<tag>.<ciphertext>` (base64url).
- Better Auth owns its four tables; they are generated with `npx @better-auth/cli@latest generate` (the docs' shorter alias is `npx auth@latest generate`) and then kept in the same schema file.
- Money columns are `Decimal(14, 2)`; values are rounded to the currency's minor units (0 or 2) before storage, so zero-decimal currencies store as `x.00`.
- The authoritative schema is `prisma/schema.prisma`. The block below is the design reference; note Prisma requires **one enum value per line** - the compact `enum X { A B }` form shown here for brevity does not parse.

### 7.2 `prisma/schema.prisma`

```prisma
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "postgresql"
}

// ───────────────────────── Auth (Better Auth-managed) ─────────────────────────

enum UserRole {
  OWNER
  VIEWER
}

model User {
  id            String    @id
  name          String
  email         String    @unique
  emailVerified Boolean   @default(false)
  image         String?
  role          UserRole  @default(OWNER)
  timezone      String?   // IANA zone; filled by the app shell on first render, editable in Settings → Account
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  sessions      Session[]
  accounts      Account[]
  auditEvents   AuditEvent[]

  @@map("user")
}

model Session {
  id        String   @id
  token     String   @unique
  expiresAt DateTime
  ipAddress String?
  userAgent String?
  userId    String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@map("session")
}

model Account {
  id                    String    @id
  accountId             String
  providerId            String
  userId                String
  accessToken           String?
  refreshToken          String?
  idToken               String?
  accessTokenExpiresAt  DateTime?
  refreshTokenExpiresAt DateTime?
  scope                 String?
  password              String?
  createdAt             DateTime  @default(now())
  updatedAt             DateTime  @updatedAt

  user                  User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([providerId, accountId])
  @@index([userId])
  @@map("account")
}

model Verification {
  id         String   @id
  identifier String
  value      String
  expiresAt  DateTime
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  @@index([identifier])
  @@map("verification")
}

// ───────────────────────── Enums ─────────────────────────

enum IssuerType        { INDIVIDUAL COMPANY }
enum TaxRegime         { INDIA_GST UK_VAT US_SALES_TAX NONE }
enum SupplyType        { INTRA_STATE INTER_STATE EXPORT_LUT EXPORT_WITH_TAX REVERSE_CHARGE NOT_APPLICABLE }
enum TaxType           { CGST SGST IGST VAT SALES_TAX OTHER }
enum DocumentKind      { INVOICE CREDIT_NOTE }
enum DocumentFormat    { PDF DOCX }
enum DocumentStatus    { DRAFT ISSUED VOID }
enum DiscountType      { AMOUNT PERCENT }
enum UnitType          { HOUR DAY FIXED MILESTONE UNIT }
enum PaymentMethodType { BANK_TRANSFER UPI WISE REVOLUT PAYPAL CUSTOM }
enum PaymentKind       { PAYMENT REFUND WRITE_OFF }
enum TaxIdType         { GSTIN VAT EIN OTHER }
enum AssetKind         { LOGO SIGNATURE STAMP RECEIPT }
enum EmailStatus       { SENT FAILED MANUAL }

// ───────────────────────── Master data ─────────────────────────

model IssuerProfile {
  id                     String     @id @default(uuid(7))
  type                   IssuerType @default(INDIVIDUAL)
  isDefault              Boolean    @default(false)
  label                  String
  legalName              String
  tradeName              String?
  designation            String?
  email                  String
  phone                  String?
  website                String?

  address                Json       // AddressSchema
  countryCode            String     @db.VarChar(2)
  stateCode              String?    // ISO 3166-2 subdivision, e.g. "KA"
  gstStateCode           String?    @db.VarChar(2) // "29"

  panNumber              String?
  gstin                  String?
  cinNumber              String?
  ukVatNumber            String?
  usTaxIdEnc             String?    // encrypted EIN/SSN
  lutNumber              String?
  lutFiscalYear          String?    // "2026-27"

  baseCurrency           String     @default("INR") @db.VarChar(3)
  locale                 String     @default("en-IN") // document formatting only; "today" uses User.timezone
  fiscalYearStartMonth   Int        @default(4)
  invoiceNumberFormat    String     @default("INV/{FY}/{SEQ:3}")
  creditNoteNumberFormat String     @default("CN/{FY}/{SEQ:3}")
  defaultTaxRegime       TaxRegime  @default(INDIA_GST)
  defaultTdsRate         Decimal?   @db.Decimal(5, 2)
  defaultDisplayConfig   Json       // DisplayConfigSchema
  defaultNotes           String?
  defaultTerms           String?

  emailCc                String?    // comma-separated defaults for the composer
  emailBcc               String?
  emailInvoiceSubject    String?    // templates with {{placeholders}}; null → built-in default
  emailInvoiceBody       String?
  emailCreditNoteSubject String?
  emailCreditNoteBody    String?
  templateConfigOverride Json?      // TemplateConfigSchema; null → AppSetting.documentTemplate

  logoAssetId            String?    @unique
  signatureAssetId       String?    @unique
  stampAssetId           String?    @unique
  logo                   Asset?     @relation("IssuerLogo",      fields: [logoAssetId],      references: [id])
  signature              Asset?     @relation("IssuerSignature", fields: [signatureAssetId], references: [id])
  stamp                  Asset?     @relation("IssuerStamp",     fields: [stampAssetId],     references: [id])

  archivedAt             DateTime?
  createdAt              DateTime   @default(now())
  updatedAt              DateTime   @updatedAt

  invoices               Invoice[]
  creditNotes            CreditNote[]
  sequences              DocumentSequence[]

  @@index([archivedAt])
}
// Migration SQL (Prisma cannot express partial unique indexes):
// CREATE UNIQUE INDEX issuer_profile_single_default
//   ON "IssuerProfile" ((true)) WHERE "isDefault" = true AND "archivedAt" IS NULL;

model DocumentSequence {
  id              String        @id @default(uuid(7))
  issuerProfileId String
  kind            DocumentKind
  fiscalYear      String        // "2026-27"
  nextNumber      Int           @default(1)

  issuerProfile   IssuerProfile @relation(fields: [issuerProfileId], references: [id])

  @@unique([issuerProfileId, kind, fiscalYear])
}

model Client {
  id               String     @id @default(uuid(7))
  displayName      String
  contactPerson    String?
  email            String?
  phone            String?
  billingAddress   Json       // AddressSchema
  shippingAddress  Json?
  countryCode      String     @db.VarChar(2)
  stateCode        String?
  gstStateCode     String?    @db.VarChar(2)
  taxIdType        TaxIdType?
  taxId            String?
  currency         String     @db.VarChar(3)
  paymentTermsDays Int        @default(30)
  defaultTdsRate   Decimal?   @db.Decimal(5, 2)
  notes            String?

  archivedAt       DateTime?
  createdAt        DateTime   @default(now())
  updatedAt        DateTime   @updatedAt

  invoices         Invoice[]
  creditNotes      CreditNote[]

  @@index([displayName])
  @@index([archivedAt])
}

model ServiceItem {
  id             String    @id @default(uuid(7))
  name           String
  description    String?
  unitType       UnitType  @default(HOUR)
  defaultRate    Decimal   @db.Decimal(14, 2)
  currency       String    @db.VarChar(3)
  sacHsnCode     String?
  defaultTaxRate Decimal   @default(0) @db.Decimal(5, 2)
  isActive       Boolean   @default(true)

  archivedAt     DateTime?
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt

  invoiceItems   InvoiceItem[]

  @@index([name])
}

model PaymentMethodProfile {
  id           String            @id @default(uuid(7))
  name         String
  type         PaymentMethodType @default(BANK_TRANSFER)
  currency     String?           @db.VarChar(3)
  isDefault    Boolean           @default(false)
  isActive     Boolean           @default(true)
  detailsEnc   String            // encrypted JSON, PaymentMethodDetailsSchema (discriminated on `type`)
  instructions String?

  archivedAt   DateTime?
  createdAt    DateTime          @default(now())
  updatedAt    DateTime          @updatedAt

  invoiceLinks InvoicePaymentMethod[]
  payments     Payment[]
}
// Migration SQL: CREATE UNIQUE INDEX payment_method_single_default
//   ON "PaymentMethodProfile" ((true)) WHERE "isDefault" = true AND "archivedAt" IS NULL;

// ───────────────────────── Blobs ─────────────────────────

model Asset {
  id          String    @id @default(uuid(7))
  kind        AssetKind
  storageKey  String    @unique
  contentType String
  byteSize    Int
  width       Int?
  height      Int?
  sha256      String
  createdAt   DateTime  @default(now())
  createdById String?

  issuerLogo      IssuerProfile? @relation("IssuerLogo")
  issuerSignature IssuerProfile? @relation("IssuerSignature")
  issuerStamp     IssuerProfile? @relation("IssuerStamp")
  paymentReceipt  Payment?
}

model Document {
  id           String         @id @default(uuid(7))
  kind         DocumentKind
  format       DocumentFormat @default(PDF)
  version      Int            @default(1)
  invoiceId    String?
  creditNoteId String?
  templateId   String
  storageKey   String         @unique
  sha256       String
  byteSize     Int
  generatedAt  DateTime       @default(now())

  invoice      Invoice?       @relation(fields: [invoiceId],    references: [id])
  creditNote   CreditNote?    @relation(fields: [creditNoteId], references: [id])
  emails       EmailMessage[]

  @@unique([invoiceId, format, version])
  @@unique([creditNoteId, format, version])
}

// ───────────────────────── Invoices ─────────────────────────

model Invoice {
  id                 String         @id @default(uuid(7))
  issuerProfileId    String
  clientId           String
  status             DocumentStatus @default(DRAFT)

  number             String?        // @@unique([issuerProfileId, number]) - per issuer, per SPEC §4.6; a global @unique collided across profiles
  fiscalYear         String?
  sequenceNumber     Int?

  issueDate          DateTime       @db.Date
  dueDate            DateTime       @db.Date
  issuedAt           DateTime?
  sentAt             DateTime?
  voidedAt           DateTime?
  voidReason         String?

  replacesInvoiceId  String?        @unique
  replacesInvoice    Invoice?       @relation("Reissue", fields: [replacesInvoiceId], references: [id])
  replacedBy         Invoice?       @relation("Reissue")

  currency           String         @db.VarChar(3)
  fxRateToBase       Decimal        @default(1) @db.Decimal(18, 8)

  taxRegime          TaxRegime
  supplyType         SupplyType     @default(NOT_APPLICABLE)
  placeOfSupply      String?        // "Karnataka (29)"
  isReverseCharge    Boolean        @default(false)
  lutNumber          String?        // snapshotted at issue when EXPORT_LUT

  subtotal           Decimal        @default(0) @db.Decimal(14, 2)
  discountType       DiscountType?
  discountValue      Decimal?       @db.Decimal(14, 2)
  discountAmount     Decimal        @default(0) @db.Decimal(14, 2)
  taxableAmount      Decimal        @default(0) @db.Decimal(14, 2)
  taxAmount          Decimal        @default(0) @db.Decimal(14, 2)
  roundingAdjustment Decimal        @default(0) @db.Decimal(14, 2)
  total              Decimal        @default(0) @db.Decimal(14, 2)
  tdsRate            Decimal        @default(0) @db.Decimal(5, 2)
  tdsExpected        Decimal        @default(0) @db.Decimal(14, 2)
  amountPaid         Decimal        @default(0) @db.Decimal(14, 2)
  amountCredited     Decimal        @default(0) @db.Decimal(14, 2)
  balanceDue         Decimal        @default(0) @db.Decimal(14, 2)

  poReference        String?
  notes              String?
  terms              String?
  displayConfig      Json           // DisplayConfigSchema
  templateSnapshot   Json?          // TemplateConfigSchema frozen at issue (§12.2)

  issuerSnapshot         Json?      // IssuerSnapshotSchema (incl. decrypted-for-print tax IDs the config allows)
  clientSnapshot         Json?
  paymentMethodsSnapshot Json?      // decrypted details, in display order - this is what the PDF prints
  verificationToken      String     @unique

  createdAt          DateTime       @default(now())
  updatedAt          DateTime       @updatedAt

  issuerProfile      IssuerProfile  @relation(fields: [issuerProfileId], references: [id])
  client             Client         @relation(fields: [clientId],        references: [id])
  items              InvoiceItem[]
  taxLines           InvoiceTaxLine[]
  paymentMethods     InvoicePaymentMethod[]
  payments           Payment[]
  creditNotes        CreditNote[]
  documents          Document[]
  emails             EmailMessage[]

  @@index([issuerProfileId, fiscalYear])
  @@index([clientId])
  @@index([status, dueDate])
  @@index([issueDate])
}

model InvoiceItem {
  id            String       @id @default(uuid(7))
  invoiceId     String
  position      Int
  serviceItemId String?
  description   String
  sacHsnCode    String?
  unitType      UnitType     @default(HOUR)
  quantity      Decimal      @db.Decimal(12, 3)
  unitPrice     Decimal      @db.Decimal(14, 2)
  lineSubtotal  Decimal      @db.Decimal(14, 2)
  taxRate       Decimal      @default(0) @db.Decimal(5, 2)
  taxAmount     Decimal      @default(0) @db.Decimal(14, 2)
  lineTotal     Decimal      @db.Decimal(14, 2)

  invoice       Invoice      @relation(fields: [invoiceId],     references: [id], onDelete: Cascade)
  service       ServiceItem? @relation(fields: [serviceItemId], references: [id], onDelete: SetNull)

  @@unique([invoiceId, position])
}

model InvoiceTaxLine {
  id            String  @id @default(uuid(7))
  invoiceId     String
  taxType       TaxType
  rate          Decimal @db.Decimal(5, 2)
  taxableAmount Decimal @db.Decimal(14, 2)
  taxAmount     Decimal @db.Decimal(14, 2)

  invoice       Invoice @relation(fields: [invoiceId], references: [id], onDelete: Cascade)

  @@unique([invoiceId, taxType, rate])
}

model InvoicePaymentMethod {
  invoiceId              String
  paymentMethodProfileId String
  position               Int

  invoice                Invoice              @relation(fields: [invoiceId],              references: [id], onDelete: Cascade)
  paymentMethod          PaymentMethodProfile @relation(fields: [paymentMethodProfileId], references: [id])

  @@id([invoiceId, paymentMethodProfileId])
}

// ───────────────────────── Payments ─────────────────────────

model Payment {
  id                     String       @id @default(uuid(7))
  invoiceId              String
  kind                   PaymentKind  @default(PAYMENT)
  paymentDate            DateTime     @db.Date
  amountApplied          Decimal      @db.Decimal(14, 2)  // invoice currency; negative for REFUND
  tdsDeducted            Decimal      @default(0) @db.Decimal(14, 2)
  receivedAmount         Decimal?     @db.Decimal(14, 2)
  receivedCurrency       String?      @db.VarChar(3)
  exchangeRate           Decimal?     @db.Decimal(18, 8)
  bankFees               Decimal      @default(0) @db.Decimal(14, 2)
  paymentMethodProfileId String?
  reference              String?
  notes                  String?
  receiptAssetId         String?      @unique
  createdAt              DateTime     @default(now())
  updatedAt              DateTime     @updatedAt

  invoice                Invoice               @relation(fields: [invoiceId],              references: [id])
  paymentMethod          PaymentMethodProfile? @relation(fields: [paymentMethodProfileId], references: [id])
  receipt                Asset?                @relation(fields: [receiptAssetId],         references: [id])

  @@index([invoiceId])
  @@index([paymentDate])
}

// ───────────────────────── Credit notes ─────────────────────────

model CreditNote {
  id                String         @id @default(uuid(7))
  issuerProfileId   String
  clientId          String
  invoiceId         String
  status            DocumentStatus @default(DRAFT)
  number            String?        // @@unique([issuerProfileId, number]), as on Invoice
  fiscalYear        String?
  sequenceNumber    Int?
  issueDate         DateTime       @db.Date
  issuedAt          DateTime?
  voidedAt          DateTime?
  voidReason        String?
  reason            String
  currency          String         @db.VarChar(3)
  supplyType        SupplyType
  subtotal          Decimal        @default(0) @db.Decimal(14, 2) // credit amount excl. tax; tax lines apportioned from the invoice
  taxAmount         Decimal        @default(0) @db.Decimal(14, 2)
  total             Decimal        @default(0) @db.Decimal(14, 2)
  displayConfig     Json
  templateSnapshot  Json?          // TemplateConfigSchema frozen at issue
  snapshot          Json?          // issuer + client + invoice header, frozen at issue
  verificationToken String         @unique
  createdAt         DateTime       @default(now())
  updatedAt         DateTime       @updatedAt

  issuerProfile     IssuerProfile  @relation(fields: [issuerProfileId], references: [id])
  client            Client         @relation(fields: [clientId],        references: [id])
  invoice           Invoice        @relation(fields: [invoiceId],       references: [id])
  taxLines          CreditNoteTaxLine[]
  documents         Document[]
  emails            EmailMessage[]

  @@index([invoiceId])
  @@index([issuerProfileId, fiscalYear])
}

model CreditNoteTaxLine {
  id            String     @id @default(uuid(7))
  creditNoteId  String
  taxType       TaxType
  rate          Decimal    @db.Decimal(5, 2)
  taxableAmount Decimal    @db.Decimal(14, 2)
  taxAmount     Decimal    @db.Decimal(14, 2)

  creditNote    CreditNote @relation(fields: [creditNoteId], references: [id], onDelete: Cascade)

  @@unique([creditNoteId, taxType, rate])
}

// ───────────────────────── Email ─────────────────────────

model EmailMessage {
  id                String       @id @default(uuid(7))
  kind              DocumentKind
  invoiceId         String?
  creditNoteId      String?
  documentId        String?      // the attached, stored PDF
  to                String[]
  cc                String[]
  bcc               String[]
  subject           String
  bodyText          String
  status            EmailStatus
  providerMessageId String?
  error             String?
  sentById          String?
  createdAt         DateTime     @default(now())

  invoice           Invoice?     @relation(fields: [invoiceId],    references: [id])
  creditNote        CreditNote?  @relation(fields: [creditNoteId], references: [id])
  document          Document?    @relation(fields: [documentId],   references: [id])

  @@index([invoiceId])
  @@index([creditNoteId])
  @@index([createdAt])
}

// ───────────────────────── Audit & infra ─────────────────────────

model AuditEvent {
  id         String   @id @default(uuid(7))
  actorId    String?
  action     String   // "invoice.issued", "payment.created", "auth.sign_in", …
  entityType String
  entityId   String
  summary    String?
  before     Json?
  after      Json?
  ipAddress  String?
  userAgent  String?
  createdAt  DateTime @default(now())

  actor      User?    @relation(fields: [actorId], references: [id], onDelete: SetNull)

  @@index([entityType, entityId])
  @@index([createdAt])
  @@index([actorId])
}

model RateLimitBucket {          // used only when RATE_LIMIT_STORE=postgres (multi-replica)
  key         String   @id
  count       Int
  windowStart DateTime
}

model AppSetting {             // keys: documentTemplate (TemplateConfig), smtp (SmtpConfig, password field encrypted), emailDefaults
  key       String   @id
  value     Json
  updatedAt DateTime @updatedAt
}
```

### 7.3 Zod schemas for `Json` columns (`src/lib/schemas`)

- `AddressSchema`: `line1, line2?, city, state?, postalCode?, countryCode(2)`.
- `DisplayConfigSchema`: the v1 §6 interface, plus `document.showReplacesReference`, `document.showAmountInWords`, `document.showPlaceOfSupply`, `document.showSupplyStatement`, `document.showRoundingLine`.
- `PaymentMethodDetailsSchema`: `z.discriminatedUnion("type", [...])` matching `SPEC.md` §4.5.
- `IssuerSnapshotSchema`, `ClientSnapshotSchema`, `PaymentMethodsSnapshotSchema`: exactly what the renderer needs, nothing more; snapshots include only the fields the display config permitted at issue time, so a later "show PAN" toggle cannot retroactively leak into a re-render.
- `TemplateConfigSchema` (§12.2) for `AppSetting.documentTemplate`, `IssuerProfile.templateConfigOverride` and the two `templateSnapshot` columns; `SmtpConfigSchema` and `EmailDefaultsSchema` (§12.4) for the other `AppSetting` keys.
- `CurrencySchema`: ISO 4217 code whose `minorUnits()` is 0 or 2 - the seven three-decimal currencies are rejected here.

---

## 8. Domain logic modules

### 8.1 Money (`src/lib/money`)

```ts
import Decimal from "decimal.js";
Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

export const D = (v: Decimal.Value) => new Decimal(v);
/** Minor units from Intl: INR/USD → 2, JPY/KRW → 0. Three-decimal currencies never reach here (CurrencySchema). */
export const minorUnits = (currency: string) =>
  new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits;
export const roundMoney = (v: Decimal, currency: string) => v.toDecimalPlaces(minorUnits(currency), Decimal.ROUND_HALF_UP);
export const sum = (xs: Decimal[]) => xs.reduce((a, b) => a.plus(b), D(0));

/** Apportion `amount` across `weights` so the parts sum exactly to `amount` (largest-remainder). */
export function apportion(amount: Decimal, weights: Decimal[]): Decimal[] { /* … */ }
```

Prisma returns `Decimal` instances already; never call `.toNumber()` outside formatting.

### 8.2 Tax engine (`src/lib/tax`)

```ts
export interface TaxContext {
  regime: TaxRegime;
  issuer: { countryCode: string; gstStateCode?: string; gstin?: string; lutNumber?: string; lutFiscalYear?: string };
  client: { countryCode: string; gstStateCode?: string };
  fiscalYear: string;
  isReverseCharge: boolean;
}
export interface TaxableLine { position: number; taxableAmount: Decimal; taxRate: Decimal }
export interface TaxResult {
  supplyType: SupplyType;
  lines: { position: number; taxAmount: Decimal }[];
  taxLines: { taxType: TaxType; rate: Decimal; taxableAmount: Decimal; taxAmount: Decimal }[];
  statement?: string;
}
export function computeTax(ctx: TaxContext, lines: TaxableLine[]): TaxResult
```

`india-gst.ts` implements the table in `SPEC.md` §4.7: split `r` into `CGST r/2 + SGST r/2` for intra-state (per-line tax rounded per component, then aggregated), `IGST r` for inter-state and export-with-tax, zero lines for `EXPORT_LUT`/`REVERSE_CHARGE`/`NOT_APPLICABLE`. Pure functions; table-driven unit tests with the exact rupee expectations. Rounding is per line, per component, to the currency's minor units (decided - `SPEC.md` §4.7); the engine takes the currency and uses `roundMoney`.

### 8.3 Totals (`src/lib/invoices/totals.ts`)

Pure: `(items, discount, taxResult, roundingAdjustment, tdsRate) → { subtotal, discountAmount, taxableAmount, taxAmount, total, tdsExpected, netExpected }` following the formulas in `SPEC.md` §4.6, with invoice-level discount apportioned to lines before tax.

### 8.4 Numbering (`src/lib/numbering`)

```ts
export function fiscalYearOf(date: string /* YYYY-MM-DD */, startMonth: number): string; // "2026-27" (or "2026" when startMonth === 1)
export function formatDocumentNumber(format: string, parts: { fy: string; fyyyy: string; yyyy: string; yy: string; mm: string; seq: number }): string;

/** Atomic, gap-free. Must be called inside the issue transaction so a rollback also rolls back the increment. */
export async function allocateDocumentNumber(tx: Prisma.TransactionClient, p: { issuerProfileId: string; kind: DocumentKind; fiscalYear: string }): Promise<number> {
  const [row] = await tx.$queryRaw<{ seq: number }[]>`
    INSERT INTO "DocumentSequence" ("id", "issuerProfileId", "kind", "fiscalYear", "nextNumber")
    VALUES (uuidv7(), ${p.issuerProfileId}, ${p.kind}::"DocumentKind", ${p.fiscalYear}, 2)
    ON CONFLICT ("issuerProfileId", "kind", "fiscalYear")
    DO UPDATE SET "nextNumber" = "DocumentSequence"."nextNumber" + 1
    RETURNING "nextNumber" - 1 AS seq`;
  return row.seq;
}
```

A single `INSERT … ON CONFLICT DO UPDATE … RETURNING` takes the row lock implicitly, so concurrent issues serialise without explicit `FOR UPDATE`. Integration test: 20 concurrent issues → numbers 1..20 with no duplicates or gaps.

### 8.5 Lifecycle (`src/server/dal/invoices.ts`)

```ts
export async function issueInvoice(id: string, actor: Actor) {
  const invoice = await prisma.$transaction(async (tx) => {
    const draft = await tx.invoice.findUniqueOrThrow({ where: { id }, include: { items: true, issuerProfile: true, client: true, paymentMethods: { include: { paymentMethod: true } } } });
    assert(draft.status === "DRAFT", "Only drafts can be issued");
    validateForIssue(draft);                                    // items > 0, SAC when GST, client state when intra-India, LUT validity, …
    const fy   = fiscalYearOf(draft.issueDate, draft.issuerProfile.fiscalYearStartMonth);
    const seq  = await allocateDocumentNumber(tx, { issuerProfileId: draft.issuerProfileId, kind: "INVOICE", fiscalYear: fy });
    const num  = formatDocumentNumber(draft.issuerProfile.invoiceNumberFormat, { …, seq });
    const tax  = computeTax(ctxFrom(draft, fy), taxableLines(draft));
    const tot  = computeTotals(draft, tax);
    const snap = buildSnapshots(draft, decryptPaymentMethods(draft.paymentMethods));
    const updated = await tx.invoice.update({ where: { id, status: "DRAFT" }, data: {
      status: "ISSUED", number: num, fiscalYear: fy, sequenceNumber: seq, issuedAt: new Date(),
      supplyType: tax.supplyType, lutNumber: tax.supplyType === "EXPORT_LUT" ? draft.issuerProfile.lutNumber : null,
      …tot, balanceDue: tot.total, verificationToken: randomToken(32),
      issuerSnapshot: snap.issuer, clientSnapshot: snap.client, paymentMethodsSnapshot: snap.paymentMethods,
      templateSnapshot: await resolveTemplateConfig(tx, draft.issuerProfileId),      // §12.2
      taxLines: { deleteMany: {}, create: tax.taxLines },
      items: { update: tax.lines.map(l => ({ where: { invoiceId_position: { invoiceId: id, position: l.position } }, data: { taxAmount: l.taxAmount, lineTotal: … } })) },
    }});
    await audit(tx, actor, "invoice.issued", "Invoice", id, { after: { number: num, total: tot.total } });
    return updated;
  });
  after(() => renderAndStoreDocument({ kind: "INVOICE", id: invoice.id }));   // Next 16 `after()`: runs post-response
  return invoice;
}
```

`renderAndStoreDocument` is idempotent (`Document` unique on `(invoiceId, format, version)`); the download route calls it lazily if the background render failed, so a render error never blocks issuing.

### 8.6 Balances and status

- `recalculateBalances(tx, invoiceId)` recomputes `amountPaid`, `amountCredited`, `balanceDue` from `Payment` and issued `CreditNote` rows. Called by every payment and credit-note DAL mutation, in the same transaction. Single code path.
- `creditNoteTaxLines(invoice, creditSubtotal, currency)`: the credit subtotal is apportioned **within each tax type** (CGST and SGST each see the whole subtotal split across their rates; IGST/VAT likewise), because intra-state lines carry the same taxable base twice - apportioning across all lines at once would halve the tax. Each line's tax is `roundMoney(part × rate, currency)`; total = subtotal + Σ tax. Pure; fixture-tested for mixed-rate invoices (M3 ruling).
- `displayStatus(invoice, todayInUserTz)` is pure (see `SPEC.md` §4.6) and used by lists, detail pages and exports. `todayFor(user)` = current date in `user.timezone ?? "UTC"` via `@date-fns/tz`.
- Dashboard "overdue" is a query on `status = 'ISSUED' AND balanceDue > 0 AND dueDate < :today` - no cron.

### 8.7 Formatting (`src/lib/format`)

`Intl.NumberFormat(locale, { style: "currency", currency, currencyDisplay })`, `Intl.DateTimeFormat`, and `amountInWords(amount, currency, locale)` with an Indian-numbering implementation (`lakh`, `crore`) for `en-IN` and standard short scale otherwise. Unit-tested against fixtures.

---

## 9. Authentication (Better Auth)

### 9.1 Configuration (`src/server/auth-config.ts`)

```ts
import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { genericOAuth } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { isAllowedEmail } from "./allow-list";

const oidc = [
  env.AUTH_KEYCLOAK_ISSUER && { providerId: "keycloak", discoveryUrl: `${env.AUTH_KEYCLOAK_ISSUER}/.well-known/openid-configuration`, clientId: env.AUTH_KEYCLOAK_ID!, clientSecret: env.AUTH_KEYCLOAK_SECRET!, scopes: ["openid", "profile", "email"], pkce: true },
  env.AUTH_CASDOOR_ISSUER  && { providerId: "casdoor",  discoveryUrl: `${env.AUTH_CASDOOR_ISSUER}/.well-known/openid-configuration`,  clientId: env.AUTH_CASDOOR_ID!,  clientSecret: env.AUTH_CASDOOR_SECRET!,  scopes: ["openid", "profile", "email"], pkce: true },
  env.AUTH_OIDC_ISSUER     && { providerId: "oidc",     discoveryUrl: `${env.AUTH_OIDC_ISSUER}/.well-known/openid-configuration`,     clientId: env.AUTH_OIDC_ID!,     clientSecret: env.AUTH_OIDC_SECRET!,     scopes: ["openid", "profile", "email"], pkce: true },
].filter(Boolean);

export const auth = betterAuth({
  baseURL: env.APP_URL,
  secret: env.AUTH_SECRET,
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: { enabled: env.NODE_ENV === "test" },          // e2e only; never in prod
  socialProviders: {
    ...(env.AUTH_GOOGLE_ID && { google: { clientId: env.AUTH_GOOGLE_ID, clientSecret: env.AUTH_GOOGLE_SECRET! } }),
    ...(env.AUTH_GITHUB_ID && { github: { clientId: env.AUTH_GITHUB_ID, clientSecret: env.AUTH_GITHUB_SECRET! } }),
  },
  plugins: [genericOAuth({ config: oidc }), nextCookies()],
  user: { additionalFields: {
    role:     { type: "string", defaultValue: "OWNER", input: false },
    timezone: { type: "string", required: false, input: true },     // set by the app shell, editable in Settings → Account
  } },
  account: { accountLinking: { enabled: true, trustedProviders: env.AUTH_LINKING_TRUSTED_PROVIDERS } }, // default ["google","github"]
  session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24, cookieCache: { enabled: false } }, // revocation must be immediate
  databaseHooks: {
    user: { create: { before: async (user) => {
      if (!isAllowedEmail(user.email)) throw new APIError("FORBIDDEN", { message: "This email is not allowed to sign in." });
      return { data: { ...user, role: "OWNER" } };
    } } },
  },
  advanced: { useSecureCookies: env.NODE_ENV === "production" },
  trustedOrigins: [env.APP_URL],
});
```

- `AUTH_ALLOWED_EMAILS` is parsed once in `env.ts` into exact addresses and `*@domain` globs; the app refuses to boot if it is empty in production.
- The allow-list is enforced at **user creation** (the hook), so an unlisted identity never gets a row. Existing users removed from the list are blocked in `requireUser()` on their next request.
- The hook deliberately does **not** require `emailVerified`: Google and GitHub only ever return verified emails, and a generic OIDC provider is configured by the owner and is therefore trusted by definition (many don't emit `email_verified` at all, which would have locked Casdoor users out). The actual account-takeover vector is *linking* accounts by email across providers, so `accountLinking.trustedProviders` defaults to `["google", "github"]`; add an OIDC provider id through `AUTH_LINKING_TRUSTED_PROVIDERS` only if that IdP verifies emails.
- `cookieCache` stays off. With it on, a revoked session keeps working until the cache expires, which contradicts the security page. One indexed DB read per request is nothing at this scale.
- E2E tests enable `emailAndPassword` under `NODE_ENV=test` and seed the test user directly; the allow-list hook still applies, so `.env.test` lists the test address.
- **Verified against the Better Auth docs on 2026-10-01.** `databaseHooks.user.create.before(user, ctx)` returns `{ data }` or `false`, or throws `APIError` - imported from `better-auth/api`. `genericOAuth` config keys are `providerId, clientId, clientSecret, discoveryUrl, scopes, pkce` (PKCE defaults to true). `account.accountLinking.trustedProviders` auto-links even when the provider doesn't assert a verified email; otherwise linking requires one - exactly the behaviour the bullets above rely on. The `cookieCache` docs carry the same revocation caveat. Server session APIs: `auth.api.listSessions / revokeSession({ token }) / revokeOtherSessions / revokeSessions`. Next 16 uses `proxy.ts`. Sign-in page calls `authClient.signIn.social({ provider })` for Google/GitHub and `authClient.signIn.oauth2({ providerId })` (client plugin `genericOAuthClient()`) for OIDC providers.
- `User.timezone` is null until the app shell's first render, which calls `authClient.updateUser({ timezone: Intl.DateTimeFormat().resolvedOptions().timeZone })` once; editable afterwards in Settings → Account.

### 9.2 Handler and helpers

- `src/app/api/auth/[...all]/route.ts`: `export const { GET, POST } = toNextJsHandler(auth)`.
- `src/server/auth.ts`:
  ```ts
  export const requireUser = cache(async () => {
    const s = await auth.api.getSession({ headers: await headers() });
    if (!s || !isAllowedEmail(s.user.email)) redirect("/auth/sign-in");
    return s;
  });
  export const requireOwner = async () => { const s = await requireUser(); if (s.user.role !== "OWNER") forbidden(); return s; };
  /** Route-handler variant: identical checks, but returns a 401/403 Response instead of redirecting. */
  export const requireOwnerApi = async (): Promise<Session | Response> => { /* … */ };
  ```
- Settings → Security uses `auth.api.listSessions` / `revokeSession` / `revokeOtherSessions`.
- Sign-in page lists only configured providers (derived from `env`).

---

## 10. Data access layer and authorization

- All reads and writes go through `src/server/dal/*`. Each exported function takes an `Actor` (from `requireOwner()`), validates invariants (e.g. `assertMutable(invoice)`), runs in a transaction where more than one row changes, and writes an `AuditEvent` in that transaction.
- Server actions are thin: `parse(schema, formData) → dal.fn(actor, input) → revalidatePath`. They return `{ ok: true, data } | { ok: false, fieldErrors }` - never throw to the client.
- The Prisma client is wrapped with an extension that (a) adds `archivedAt: null` to `findMany`/`findFirst` on archivable models unless `includeArchived: true` is passed, and (b) converts `@db.Date` columns to/from `YYYY-MM-DD` strings.
- `proxy.ts` (Next 16) only redirects unauthenticated *page* navigations and sets the CSP nonce. It is not the security boundary (lesson of CVE-2025-29927).

---

## 11. Storage

### 11.1 Adapter

```ts
export interface StorageAdapter {
  put(key: string, body: Buffer | Readable, meta: { contentType: string; byteSize?: number }): Promise<void>;
  get(key: string): Promise<{ stream: Readable; contentType: string; byteSize: number }>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  list(prefix: string): AsyncIterable<string>;     // for backups / orphan sweeps
}
export const storage: StorageAdapter = env.STORAGE_DRIVER === "s3" ? new S3Storage(env) : new LocalStorage(env.STORAGE_LOCAL_ROOT);
```

- **Local driver** (default): files under `STORAGE_LOCAL_ROOT=/data/storage` (a named volume). Keys are validated against `^[a-z0-9/_\-.]+$` and resolved with `path.resolve` + prefix check to prevent traversal. Writes are atomic (temp file + rename).
- **S3 driver**: `@aws-sdk/client-s3` with `forcePathStyle: true`, credentials required (no `"any"` fallback), bucket created on boot if missing. Works with SeaweedFS (`s3.json` identities), Garage, or any S3 - all self-hosted.
- Keys: `assets/{kind}/{yyyy}/{assetId}.{ext}`, `documents/{kind}/{fy}/{number-safe}-v{n}.pdf`.

### 11.2 Uploads (`/api/uploads`)

1. `requireOwner()`; rate-limited.
2. Read multipart; enforce per-kind size caps (logo/signature/stamp 2 MB, receipt 10 MB).
3. Sniff with `file-type`; allow `image/png`, `image/jpeg`, `image/webp` for images; plus `application/pdf` for receipts. Reject SVG.
4. Images through `sharp`: strip metadata, `rotate()` (EXIF orientation), resize to max 1600 px, re-encode (signature/stamp → PNG with alpha preserved; logo → PNG or WebP; receipts → JPEG q85). Record width/height.
5. Hash (SHA-256), `storage.put`, create `Asset`. Return `{ assetId }`.

### 11.3 Serving

`/api/assets/[...key]` and `/api/documents/[id]` require the owner session, stream from the adapter, set `Content-Type` from the record (never from the request), `Content-Disposition` (`inline` for images, `attachment; filename="INV-26-27-001.pdf"` for documents), `Cache-Control: private, max-age=0, no-store`, `X-Content-Type-Options: nosniff`. Nothing in storage is reachable without a session.

---

## 12. Documents, templates, verification and email

### 12.1 Rendering

- **View-model first.** `buildDocumentViewModel(invoice | creditNote)` produces a plain object (strings already formatted per locale, tax lines aggregated, amount in words, QR SVG data). The live preview (`<InvoicePreview vm={…}/>`, HTML) and the PDF (`<InvoicePdf vm={…}/>`, react-pdf) render from the same view-model, so what you see is what prints.
- **Fonts** registered once from `@fontsource/inter`, `@fontsource/ibm-plex-sans` and `@fontsource/source-serif-4` (regular, medium, semibold), with `@fontsource/noto-sans` as the symbol fallback (`₹`). Only the pairing the template config selects is embedded in a given PDF.
- **Rendering** happens in the Node runtime (`export const runtime = "nodejs"`; add `@react-pdf/renderer` to `serverExternalPackages`). Render → `Buffer` → SHA-256 → `storage.put` → `Document` row.
### 12.2 Templates

- **`TemplateConfigSchema`** (`src/lib/documents/template-config.ts`), stored under `AppSetting['documentTemplate']` and optionally in `IssuerProfile.templateConfigOverride`:

  ```ts
  export const TemplateConfigSchema = z.object({
    templateId: z.enum(["ledger", "classic", "compact"]),
    paper:  z.object({ size: z.enum(["A4", "LETTER"]), margins: z.enum(["normal", "narrow"]) }),
    colors: z.object({ accent: hexColor, text: hexColor }),
    font:   z.enum(["inter", "ibm-plex-sans", "source-serif-4+inter"]),
    logo:   z.object({ position: z.enum(["left", "right", "center"]), heightMm: z.number().min(8).max(40) }),
    title:  z.object({ mode: z.enum(["auto", "custom"]), custom: z.string().max(40).optional() }),
    labels: z.record(z.enum(LABEL_KEYS), z.string().max(40)).partial(),
    table:  z.object({ style: z.enum(["ruled", "zebra", "plain"]) }),
    totals: z.object({ showSubtotal: z.boolean(), showDiscount: z.boolean(), showTaxLines: z.boolean(),
                       showTdsExpected: z.boolean(), showRounding: z.boolean(),
                       amountInWords: z.enum(["below-total", "footer", "hidden"]) }),
    text:   z.object({ headerNote: z.string().max(300).optional(), footer: z.string().max(300).optional(),
                       signatureCaption: z.string().max(60).optional(), draftWatermark: z.string().max(40) }),
    qr:     z.object({ position: z.enum(["header", "footer", "beside-totals"]) }),
    pageNumbers: z.boolean(),
  });
  ```

- **Resolution order** at render: `issuerProfile.templateConfigOverride ?? AppSetting.documentTemplate ?? DEFAULT_TEMPLATE_CONFIG`, computed by `resolveTemplateConfig(tx, issuerProfileId)` and frozen into `Invoice.templateSnapshot` / `CreditNote.templateSnapshot` at issue. Stored documents and regenerated versions render from the snapshot; the draft preview and the settings preview render from the live resolution.
- **Implementation.** Each template is a folder `templates/<id>/` exporting `Pdf` (react-pdf) and `Preview` (HTML) components taking `{ vm, config }`. Shared blocks (header, party blocks, items table, totals, payment methods, footer, QR) live in `templates/_shared` and are styled from the config, so the three templates differ in composition and style, not logic. Adding a fourth template is a new folder plus an enum value.
- **Settings → Templates** (`/settings/templates`): gallery with thumbnails → form (react-hook-form + the schema) → live HTML preview on a fixed sample invoice → "Download sample PDF" (`/api/documents/preview?sample=1`) → save (server action, audited) → reset → export/import JSON. The per-issuer override is the same form mounted on the profile editor behind a switch.
- **Boundary.** Parameters only. No user-supplied markup, CSS or fonts reach the renderer; colours are validated as hex; every text field is length-capped.

### 12.3 Verification

- **Verification tokens.** A random token is set when a draft is created (the column is non-null) and **rotated at issue**, so a QR printed on a draft preview never resolves. The verification lookup additionally filters `status IN ('ISSUED', 'VOID')`.
- **Verification page** reads `Invoice`/`CreditNote` by `verificationToken` (constant-time comparison is unnecessary: the token is a random 256-bit database key; timing on a `@unique` lookup does not leak neighbours), rate-limited 30/min/IP, and returns the same shell for missing tokens. Client-side hash check uses `crypto.subtle.digest` on a file the user picks - nothing is uploaded.
- **Draft preview PDF.** `/api/documents/preview?invoice=<id>` renders a draft on demand with a diagonal "DRAFT - not a tax invoice" watermark, no number and no QR; it is never stored.
- **Render race.** Two concurrent downloads of a not-yet-rendered document may both render; the `Document` unique constraint makes the second insert fail, which is caught and the existing row re-read. Idempotent by construction.
- **DOCX** (v1.1): `docx` package rendering from the same view-model.

### 12.4 Email

- **Transport** (`src/lib/email/transport.ts`): `nodemailer.createTransport` from `resolveSmtpConfig()` = `AppSetting['smtp']` (password decrypted through `lib/crypto`) if present, else the `SMTP_*` environment, else `null`. `SMTP_SECURITY ∈ starttls | tls | none`. The transport is cached and rebuilt when settings change; `verifyTransport()` backs **Send test email**.
- **Templates** (`src/lib/email/templates.ts`): per-issuer subject/body strings with `{{placeholder}}` tokens (built-in defaults when null). `renderTemplate(template, vm)` substitutes from the document view-model, leaves unknown tokens visible so mistakes are obvious, and returns `{ text, html }` where `html` is the escaped text with paragraphs and links only.
- **Composer** (`/invoices/[id]/send`, `/credit-notes/[id]/send`): a page, not a modal. The server component loads the document and the rendered defaults; the form holds `to[]`, `cc[]`, `bcc[]`, `subject`, `body`; the attachment is shown, not editable. Server action `sendDocumentEmail` → `requireOwner()` → Zod (valid addresses, ≤ 10 recipients, body ≤ 10 000 chars) → rate limit (30/h) → stored `Document` bytes from storage → `transport.sendMail({ from, replyTo, to, cc, bcc, subject, text, html, attachments: [{ filename: "INV-26-27-001.pdf", content }] })` → `EmailMessage` row (`SENT` + `providerMessageId`, or `FAILED` + error) → `sentAt` on first success → audit → redirect to the document with a toast.
- **Fallback** when `resolveSmtpConfig()` is `null`: the same page renders **Open in mail app** (`mailto:` built with `encodeURIComponent`), triggers the PDF download, and shows **Mark as sent** (server action sets `sentAt` and logs an `EmailMessage` with status `MANUAL`).
- **Settings → Email** (`/settings/email`): SMTP form (host, port, security, user, write-only password, from name/address, reply-to) with a "configured by environment" banner when applicable; test send; default CC/BCC; the last 50 `EmailMessage` rows. Per-issuer subject/body templates are edited on the profile form with a placeholder reference.
- **Dev/CI**: `compose.dev.yml` runs Mailpit (`axllent/mailpit`, SMTP 1025, UI 8025); tests assert the message and attachment through Mailpit's API.

---

## 13. Exports (CSV, XLSX, ZIP)

### 13.1 Datasets

Each dataset in `src/lib/exports/datasets/*.ts` declares:

```ts
export interface Dataset<Row> {
  id: "invoices" | "invoice-items" | "payments" | "credit-notes" | "clients" | "services" | "gst-summary" | "tds-summary";
  filters: z.ZodType<Filters>;
  columns: Column<Row>[];                       // { key, header, type: "string" | "number" | "date" | "currency", width? }
  rows(filters: Filters): AsyncIterable<Row>;   // cursor-paginated Prisma queries, 500 rows per page
}
```

Columns per dataset are listed in `SPEC.md` §4.11.

### 13.2 Writers

- **CSV** (`csv-stringify` stream): UTF-8 BOM, `\r\n`, quote when needed, dates ISO, numbers via `Decimal.toFixed(minorUnits(row.currency))`, every string through `guardCell()`.
- **XLSX** (`exceljs` `WorkbookWriter` streaming): header row bold + frozen (`views: [{ state: "frozen", ySplit: 1 }]`), `autoFilter`, numeric cells with `numFmt: "#,##0.00"`, date cells as real dates, strings through `guardCell()` and written as explicit string values; second sheet `Filters` with the filter values, dataset id, generated-at, app version.
- **ZIP** (`archiver`): `okinvo-data-<date>.zip` (all datasets as CSV + `data.json` + `README.txt` describing the schema version); `okinvo-documents-<fy>.zip` (PDFs named by number, plus an `index.csv`).

### 13.3 Formula-injection guard (`guard.ts`)

```ts
const RISKY = /^[=+\-@\t\r]/;
export const guardCell = (s: string) => (RISKY.test(s) ? `'${s}` : s);
```

Applied to every text cell in both writers; unit-tested with the OWASP cases.

### 13.4 Route

`GET /api/exports/[dataset]?format=csv|xlsx&…filters` → `requireOwner()` → rate limit (10/min) → parse filters → stream with `Content-Disposition: attachment; filename="okinvo-<dataset>-<from>_<to>.<ext>"` → `audit("export.generated")`. Register pages link to it with their current filter query string.

---

## 14. Security controls (what actually exists)

| Control | Implementation |
|---|---|
| Access | Allow-listed SSO; `requireOwner()` in every DAL entry point. With `AUTH_PASSWORD_SIGNIN=true` (R1) a password sign-up is accepted only for an address listed *exactly* in `AUTH_ALLOWED_EMAILS` - a `*@domain` pattern covers provider sign-ins only - because a password sign-up proves nothing about who owns the address |
| Sessions | Server-side, HttpOnly + Secure + SameSite=Lax cookies; 30-day sliding; listed and revocable; revoked on allow-list removal |
| CSRF | Better Auth origin checks on its endpoints; Next Server Actions enforce same-origin; custom `POST` routes check `Origin` against `APP_URL` |
| Headers (`proxy.ts` + `next.config.ts`) | `Content-Security-Policy: default-src 'self'; script-src 'self' 'nonce-…' 'strict-dynamic'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self' <idp-origins>` · `Strict-Transport-Security: max-age=31536000; includeSubDomains` (no `preload` by default; self-hosters opt in) · `X-Content-Type-Options: nosniff` · `Referrer-Policy: strict-origin-when-cross-origin` · `Permissions-Policy: camera=(), microphone=(), geolocation=()` · `Cross-Origin-Opener-Policy: same-origin` |
| Field encryption | AES-256-GCM, key `FIELD_ENCRYPTION_KEY` (32 bytes base64), versioned ciphertext prefix for rotation; applied to `PaymentMethodProfile.detailsEnc`, `IssuerProfile.usTaxIdEnc`, `Invoice.paymentMethodsSnapshotEnc` (the bank details an issued invoice prints), `Invoice/CreditNote.verificationTokenEnc`, the SMTP password; decrypted only in DAL functions that need to print or edit them; redacted in audit diffs and left out of the all-data export |
| Tokens | `verificationToken` = 32 bytes from `crypto.randomBytes`, base64url; the row stores its SHA-256 (lookup key) plus an encrypted copy for rebuilding links, so a database leak yields no usable verify links. API tokens: Better Auth `jwt` plugin (EdDSA, 15 min, `/api/auth/token`, `/api/auth/jwks`), accepted as `Authorization: Bearer` by route handlers after re-reading the user; browser sessions stay server-side cookies |
| Uploads | Size caps, magic-byte sniffing, `sharp` re-encode, SVG rejected, keys validated, served with `nosniff` and never inline for PDFs from untrusted sources (receipts are `attachment`) |
| Rate limiting | Token bucket per client IP (from `X-Forwarded-For` first hop, trusted only when `TRUST_PROXY=true`, which compose/k8s set): `/api/auth/*` 20/min, `/verify/*` 30/min, `/api/uploads` 30/min, `/api/exports/*` 10/min, email sends 30/h. `RATE_LIMIT_STORE=memory` (default) or `postgres` for multi-replica |
| Email | SMTP password encrypted in `AppSetting`; composer body is plain text rendered to escaped HTML plus a text part; attachments only from stored `Document` rows; recipients validated and capped; nothing sent without an explicit click; every attempt logged |
| Templates | Parameters only - no user-supplied markup, CSS or fonts reach the renderer; hex-validated colours; length-capped strings; snapshot at issue means settings changes can't rewrite history |
| Secrets | Environment only; `.env` gitignored; `.env.example` committed; `scripts/gen-secrets.sh` generates strong values |
| Containers | Non-root `uid 1001`, read-only root FS with `/tmp` and `/data` writable, `no-new-privileges`, all capabilities dropped |
| Network | Only Caddy (or the Ingress) is reachable; app→postgres/seaweedfs on an internal network; K8s `NetworkPolicy` default-deny |
| Audit | Append-only `AuditEvent` for every state change and auth event |
| Dependencies | Exact pins; Renovate; `pnpm audit` and Trivy image scan in CI; `docker scout`/Trivy in `release.sh` |
| Backups | Nightly; encrypted at rest only if the backup volume is (documented; optional `age` encryption in `backup.sh`) |

Removed from v1's claims because nothing implements them: "zero-trust", "WAF", "TLS 1.3 only", "parameterized queries restrict access".

---

## 15. Configuration (`.env.example`)

```dotenv
# ── App ──────────────────────────────────────────────────────────────
APP_URL=https://invoices.example.com          # public origin; also Better Auth baseURL
NODE_ENV=production
LOG_LEVEL=info
TRUST_PROXY=true

# ── Database ─────────────────────────────────────────────────────────
POSTGRES_USER=okinvo
POSTGRES_PASSWORD=change-me                   # scripts/gen-secrets.sh
POSTGRES_DB=okinvo
DATABASE_URL=postgresql://okinvo:change-me@postgres:5432/okinvo

# ── Auth ─────────────────────────────────────────────────────────────
AUTH_SECRET=change-me                         # 32+ random bytes, base64
AUTH_ALLOWED_EMAILS=you@example.com,*@yourdomain.com
AUTH_GOOGLE_ID= / AUTH_GOOGLE_SECRET=
AUTH_GITHUB_ID= / AUTH_GITHUB_SECRET=
AUTH_KEYCLOAK_ISSUER= / AUTH_KEYCLOAK_ID= / AUTH_KEYCLOAK_SECRET=
AUTH_CASDOOR_ISSUER=  / AUTH_CASDOOR_ID=  / AUTH_CASDOOR_SECRET=
AUTH_OIDC_ISSUER= / AUTH_OIDC_ID= / AUTH_OIDC_SECRET= / AUTH_OIDC_NAME="Company SSO"
AUTH_LINKING_TRUSTED_PROVIDERS=google,github   # add an OIDC provider id only if that IdP verifies emails

# ── Encryption ───────────────────────────────────────────────────────
FIELD_ENCRYPTION_KEY=change-me                # 32 bytes, base64

# ── Storage ──────────────────────────────────────────────────────────
STORAGE_DRIVER=local                          # local | s3
STORAGE_LOCAL_ROOT=/data/storage
S3_ENDPOINT=http://seaweedfs:8333
S3_REGION=us-east-1
S3_BUCKET=okinvo
S3_ACCESS_KEY= / S3_SECRET_KEY=

# ── Email (optional; Settings → Email overrides these) ───────────────
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURITY=starttls                        # starttls | tls | none
SMTP_USER= / SMTP_PASSWORD=
SMTP_FROM=invoices@example.com
SMTP_FROM_NAME="Your Name"
SMTP_REPLY_TO=

# ── Limits ───────────────────────────────────────────────────────────
RATE_LIMIT_STORE=memory                       # memory | postgres
UPLOAD_MAX_IMAGE_MB=2
UPLOAD_MAX_RECEIPT_MB=10

# ── Backups (compose `backup` service) ───────────────────────────────
BACKUP_CRON="0 2 * * *"
BACKUP_RETENTION_DAYS=30
```

`src/lib/env.ts` validates all of this with Zod at boot (`@t3-oss/env-nextjs`), including "at least one auth provider configured" and "allow-list non-empty in production".

---

## 16. Docker

### 16.1 `docker/Dockerfile`

```dockerfile
# syntax=docker/dockerfile:1.7
ARG NODE_IMAGE=node:24.21.0-alpine

FROM ${NODE_IMAGE} AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1
RUN npm i -g pnpm@10.34.5 && apk add --no-cache tini
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml .npmrc ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
# prisma.config.ts reads DATABASE_URL via env(), which throws when unset; generate never connects.
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build
RUN pnpm prisma generate && pnpm build            # next.config.ts: output: "standalone"

# ── Migration image: Prisma CLI + schema only ──
FROM deps AS migrate
COPY prisma ./prisma
COPY prisma.config.ts ./
USER node
ENTRYPOINT ["tini", "--"]
CMD ["pnpm", "prisma", "migrate", "deploy"]

# ── Runtime image ──
FROM ${NODE_IMAGE} AS runner
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
RUN apk add --no-cache tini && addgroup -S -g 1001 app && adduser -S -u 1001 -G app app \
 && mkdir -p /data/storage /tmp/okinvo && chown -R app:app /data /tmp/okinvo
WORKDIR /app
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/public ./public
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s CMD wget -qO- http://127.0.0.1:3000/api/health/live || exit 1
ENTRYPOINT ["tini", "--"]
CMD ["node", "server.js"]
```

`.dockerignore`: `.git`, `node_modules`, `.next`, `.env*`, `tests`, `k8s`, `compose*.yml`, `*.md`.

Notes:
- `.npmrc` (`engine-strict=true`, `save-exact=true`) is created at M0 so the `COPY` succeeds.
- The `migrate` stage carries the full `node_modules` (~400 MB). Acceptable for a one-shot container; if it bothers you, `pnpm deploy --prod` into a scratch dir with `prisma` promoted to a runtime dependency. If Prisma 7's `migrate deploy` turns out to need a native schema engine on Alpine, add `apk add --no-cache openssl` to that stage.
- Next writes its image-optimisation cache to `.next/cache`. With `read_only: true` that path must be a tmpfs (see compose / the K8s `emptyDir`) - or set `images.unoptimized: true`, which is fine here because every image is served through `/api/assets` anyway.
- Prisma 7's client ships a WASM query compiler; confirm at M0 that Next's standalone output traces the `.wasm` files (`outputFileTracingIncludes` if not).

### 16.2 `compose.yml` (repo root)

```yaml
name: okinvo

x-app-env: &app-env
  env_file: .env                                # `${…}` interpolation below also reads ./.env

services:
  caddy:                                        # no depends_on: a broken app yields a 502, not a missing proxy
    image: caddy:2.11.4-alpine
    restart: unless-stopped
    ports: ["80:80", "443:443", "443:443/udp"]
    environment: { APP_DOMAIN: "${APP_DOMAIN:?set APP_DOMAIN in .env}" }
    volumes:
      - ./docker/Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    networks: [web]

  app:
    image: docker.io/deveshgupta30/okinvo:${OKINVO_VERSION:-latest}
    build: { context: ., dockerfile: docker/Dockerfile, target: runner }
    restart: unless-stopped
    <<: *app-env
    volumes: [app_data:/data]
    read_only: true
    tmpfs: [/tmp, /app/.next/cache]
    security_opt: [no-new-privileges:true]
    cap_drop: [ALL]
    networks: [web, data]
    depends_on:
      migrate:  { condition: service_completed_successfully }
      postgres: { condition: service_healthy }
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://127.0.0.1:3000/api/health/ready"]
      interval: 15s
      timeout: 3s
      retries: 5
      start_period: 30s

  migrate:
    image: docker.io/deveshgupta30/okinvo:${OKINVO_VERSION:-latest}-migrate
    build: { context: ., dockerfile: docker/Dockerfile, target: migrate }
    <<: *app-env
    networks: [data]
    depends_on: { postgres: { condition: service_healthy } }

  postgres:
    image: postgres:18.6-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
    volumes: [pg_data:/var/lib/postgresql]       # postgres:18 image: mount the parent, not …/data
    security_opt: [no-new-privileges:true]
    networks: [data]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U $${POSTGRES_USER} -d $${POSTGRES_DB}"]
      interval: 5s
      timeout: 3s
      retries: 10

  backup:
    image: postgres:18.6-alpine
    restart: unless-stopped
    <<: *app-env
    entrypoint: ["/bin/sh", "/backup/backup.sh", "--daemon"]
    volumes:
      - ./docker/backup:/backup:ro
      - app_data:/data:ro
      - backups:/backups
    networks: [data]
    depends_on: { postgres: { condition: service_healthy } }

  seaweedfs:                                   # only with: docker compose --profile s3 up
    profiles: [s3]
    image: chrislusf/seaweedfs:4.48
    restart: unless-stopped
    command: >
      server -dir=/data -ip=seaweedfs -master.volumeSizeLimitMB=1024
             -s3 -s3.port=8333 -s3.config=/etc/seaweedfs/s3.json
    volumes:
      - seaweed_data:/data
      - ./docker/seaweedfs/s3.json:/etc/seaweedfs/s3.json:ro
    networks: [data]
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://127.0.0.1:9333/cluster/status"]
      interval: 10s
      timeout: 3s
      retries: 5

networks:
  web: {}
  data: { internal: true }

volumes:
  pg_data: {}
  app_data: {}
  backups: {}
  caddy_data: {}
  caddy_config: {}
  seaweed_data: {}
```

Notes:
- No `version:` key (obsolete in Compose v2).
- Only Caddy publishes ports. `data` is `internal: true` (no egress); `app` also sits on `web` so it can reach the identity providers.
- `migrate` runs to completion before `app` starts; upgrading is `docker compose pull && docker compose up -d`.
- `docker/seaweedfs/s3.json.example` defines one identity with `Read`, `Write`, `List` on bucket `okinvo`; without `-s3.config` SeaweedFS accepts anonymous requests, which is why v1 was open.

### 16.3 `docker/Caddyfile`

```
{$APP_DOMAIN} {
    encode zstd gzip
    request_body { max_size 25MB }
    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
        -Server
    }
    reverse_proxy app:3000 {
        header_up X-Forwarded-Proto {scheme}
    }
    log { output file /data/access.log { roll_size 10MiB roll_keep 5 } }
}
```

For a LAN-only deployment set `APP_DOMAIN=okinvo.lan` and add `tls internal`.

### 16.4 Backups (`docker/backup/backup.sh`)

- Runs on `BACKUP_CRON`: `pg_dump -Fc` → `/backups/pg/okinvo-<ts>.dump`; `tar -czf /backups/storage/storage-<ts>.tgz -C /data storage` (local driver) or `weed shell s3.* ` / `rclone` for the S3 driver (documented); prune older than `BACKUP_RETENTION_DAYS`; writes `/backups/last-success` which `/settings/data` reads.
- `restore.sh <pg-dump> <storage-tgz>`: stops `app`, `pg_restore --clean --if-exists`, untars storage, restarts. **Tested in CI** against a seeded database (see §19).

### 16.5 Development (`compose.dev.yml`)

Postgres (published on `127.0.0.1:5432`), Mailpit (`axllent/mailpit`, SMTP `1025`, web UI `8025`) for email testing, and optional SeaweedFS; the app runs with `pnpm dev` on the host.

---

## 17. Kubernetes (Kustomize)

`k8s/base` contains, with the same images as compose:

| Resource | Key points |
|---|---|
| `Namespace okinvo` | |
| `ConfigMap okinvo-config` | Non-secret env only (`APP_URL`, `STORAGE_DRIVER`, `TRUST_PROXY`, `RATE_LIMIT_STORE`, …). |
| `Secret okinvo-secrets` | **Not in the repo.** Created with `kubectl -n okinvo create secret generic okinvo-secrets --from-env-file=.env.secrets`. Optional overlay for Sealed Secrets / External Secrets if you already run them. |
| `StatefulSet postgres` | `postgres:18.6-alpine`, PVC 20Gi, env from `secretKeyRef`, `securityContext` (`runAsUser: 70`, `fsGroup: 70`), requests/limits, `pg_isready` probes. |
| `Deployment app` | `replicas: 1`, `strategy: Recreate` when `STORAGE_DRIVER=local` (RWO volume), `RollingUpdate` when `s3`. **Init container `migrate`** runs the `…:<ver>-migrate` image (`prisma migrate deploy`) before the app container starts - the same semantics as the compose `migrate` service, with no separate Job to sequence. Safe even with several replicas because `migrate deploy` takes a Postgres advisory lock. Full hardening below. Separate liveness (`/api/health/live`) and readiness (`/api/health/ready`) probes. |
| `PersistentVolumeClaim app-data` | RWO, 10Gi, mounted at `/data`. |
| `Service okinvo` | ClusterIP 80 → 3000. |
| `Ingress okinvo` | `spec.ingressClassName` (default `nginx`, patchable), cert-manager annotation, body-size annotation 25m. |
| `NetworkPolicy` | Default deny ingress+egress in the namespace; allow ingress-controller → app:3000; app → postgres:5432; app → seaweedfs:8333 (overlay); app → DNS + `0.0.0.0/0:443` (identity providers); backup → postgres. |
| `CronJob backup` | `postgres:18.6-alpine` running the same `backup.sh`, writing to a `backups` PVC. |
| `PodDisruptionBudget` | Only meaningful with >1 replica; included in the `s3` overlay. |

Application pod hardening (the init container gets the same container-level `securityContext`):

```yaml
securityContext:
  runAsNonRoot: true
  runAsUser: 1001
  runAsGroup: 1001
  fsGroup: 1001
  seccompProfile: { type: RuntimeDefault }
initContainers:
  - name: migrate
    image: docker.io/deveshgupta30/okinvo:1.0.0-migrate
    envFrom: [{ configMapRef: { name: okinvo-config } }, { secretRef: { name: okinvo-secrets } }]
    securityContext: { allowPrivilegeEscalation: false, readOnlyRootFilesystem: true, capabilities: { drop: ["ALL"] } }
containers:
  - name: app
    image: docker.io/deveshgupta30/okinvo:1.0.0
    securityContext:
      allowPrivilegeEscalation: false
      readOnlyRootFilesystem: true
      capabilities: { drop: ["ALL"] }
    volumeMounts:
      - { name: app-data, mountPath: /data }
      - { name: tmp, mountPath: /tmp }                       # emptyDir
      - { name: next-cache, mountPath: /app/.next/cache }    # emptyDir
    resources:
      requests: { cpu: 250m, memory: 512Mi }
      limits:   { memory: 1Gi }          # no CPU limit: avoids throttling PDF renders
```

Runbook:

```bash
kubectl create namespace okinvo
kubectl -n okinvo create secret generic okinvo-secrets --from-env-file=.env.secrets   # before the first apply
kubectl apply -k k8s/base                                   # config, postgres, policies, app (init container migrates)
kubectl -n okinvo rollout status deployment/okinvo
# upgrade: bump the tag under `images:` in k8s/base/kustomization.yaml, then `kubectl apply -k k8s/base`
```

Overlays: `with-seaweedfs` (adds the StatefulSet, Service, NetworkPolicy rule, `STORAGE_DRIVER=s3`, `RATE_LIMIT_STORE=postgres`, `replicas: 2`, PDB).

---

## 18. CI/CD and releases

### 18.1 GitHub Actions - `ci.yml` (every push and PR)

Action versions verified 2026-10-01. Every job that needs a database uses `compose.dev.yml` - the same Postgres you run locally - rather than GitHub's `services:` block, so there is one definition and no port clash with the restore drill.

```yaml
name: ci
on: { push: { branches: [main] }, pull_request: {} }
env:
  PNPM_VERSION: 10.34.5
  NODE_VERSION: 24.21.0
  DATABASE_URL: postgresql://okinvo:okinvo@localhost:5432/okinvo_test
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: pnpm/action-setup@v6
        with: { version: "${{ env.PNPM_VERSION }}" }
      - uses: actions/setup-node@v7
        with: { node-version: "${{ env.NODE_VERSION }}", cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: docker compose -f compose.dev.yml up -d --wait postgres
      - run: pnpm prisma generate
      - run: pnpm lint && pnpm typecheck
      - run: npx @google/design.md lint DESIGN.md && npx @google/design.md lint DESIGN.light.md && pnpm design:tokens --check
      - run: pnpm prisma migrate deploy
      - run: pnpm test -- --coverage
      - run: pnpm audit --audit-level=high
      - run: pnpm build
  restore-drill:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - run: docker compose -f compose.dev.yml up -d --wait postgres
      - run: scripts/restore-drill.sh          # seed → backup.sh → wipe → restore.sh → assert row counts + one PDF hash
  e2e:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: pnpm/action-setup@v6
        with: { version: "${{ env.PNPM_VERSION }}" }
      - uses: actions/setup-node@v7
        with: { node-version: "${{ env.NODE_VERSION }}", cache: pnpm }
      - run: pnpm install --frozen-lockfile && pnpm exec playwright install --with-deps chromium
      - run: docker compose -f compose.dev.yml up -d --wait postgres
      - run: cp .env.test .env && pnpm prisma migrate deploy
      - run: pnpm test:e2e                     # playwright.config webServer: `pnpm build && pnpm start`
      - uses: actions/upload-artifact@v7
        if: failure()
        with: { name: playwright-report, path: playwright-report }
  image:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: docker/setup-buildx-action@v4
      - uses: docker/build-push-action@v7
        with: { context: ., file: docker/Dockerfile, target: runner, push: false, load: true, tags: okinvo:ci }
      - uses: aquasecurity/trivy-action@v0.36.0
        with: { image-ref: okinvo:ci, severity: HIGH,CRITICAL, exit-code: "1", ignore-unfixed: true }
```

### 18.2 Releases - built on your machine, pushed to Docker Hub

You said CI should run against your local Docker, which is logged in to `docker.io/deveshgupta30`. Releases therefore run locally by default:

```bash
# scripts/release.sh <version>   e.g. scripts/release.sh 1.0.0
set -euo pipefail
VERSION="$1"; IMAGE="docker.io/deveshgupta30/okinvo"
SOURCE="https://github.com/deveshgupta30/okinvo"
git diff --quiet || { echo "working tree dirty"; exit 1; }
pnpm lint && pnpm typecheck && pnpm test
docker buildx create --name okinvo --use 2>/dev/null || docker buildx use okinvo

# 1. Build the host architecture locally and scan it BEFORE anything is pushed.
docker buildx build -f docker/Dockerfile --target runner --load -t "$IMAGE:$VERSION" \
  --label "org.opencontainers.image.version=$VERSION" --label "org.opencontainers.image.source=$SOURCE" .
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock aquasec/trivy:latest \
  image --severity HIGH,CRITICAL --exit-code 1 --ignore-unfixed "$IMAGE:$VERSION"

# 2. Multi-arch build (host arch is a cache hit) and push runner + migrate images.
for target in runner migrate; do
  suffix=""; [ "$target" = migrate ] && suffix="-migrate"
  docker buildx build --platform linux/amd64,linux/arm64 -f docker/Dockerfile --target "$target" \
    --label "org.opencontainers.image.version=$VERSION" --label "org.opencontainers.image.source=$SOURCE" \
    -t "$IMAGE:$VERSION$suffix" -t "$IMAGE:latest$suffix" --push .
done

git tag -a "v$VERSION" -m "okinvo $VERSION" && git push origin "v$VERSION"
```

Two optional additions, both off until you want them:

- **`release.yml`** on tag `v*`: same buildx steps using `docker/login-action@v4` with repository secrets `DOCKERHUB_USERNAME` / `DOCKERHUB_TOKEN` (a Docker Hub *access token*, read/write scope on `okinvo` only).
- **`act`** (`nektos/act`) to run `ci.yml` itself inside your local Docker: `act push -j test`. Useful when you don't want to wait for hosted runners.

### 18.3 Renovate (`renovate.json`)

`extends: ["config:recommended", ":pinAllExceptPeerDependencies", "docker:pinDigests"]`, grouped minor/patch updates weekly, majors as separate PRs, Node/Postgres/Caddy/SeaweedFS image tags tracked from the Dockerfile and compose/K8s manifests.

---

## 19. Testing

| Layer | Tool | What |
|---|---|---|
| Unit | Vitest | `money` (`minorUnits`/`roundMoney` for INR, JPY and a rejected BHD; apportion sums exactly), `tax/india-gst` (every row of the SPEC table with rupee-exact expectations, CGST/SGST rounding symmetry), `credit-notes/apportion` (mixed 18 %/12 % invoices foot exactly), `numbering` (fiscal year boundaries incl. 31 Mar / 1 Apr, format tokens), `invoices/totals`, `invoices/status` (user-timezone "today"), `format/amountInWords` (en-IN and en), `documents/template-config` (schema, resolution order, snapshot beats live settings), `email/templates` (placeholders, escaping, unknown tokens left visible), `exports/guard` (OWASP list), `crypto` (round-trip, tamper detection, version prefix), `schemas` (every Json schema against fixtures), `storage/local` (path traversal rejected) |
| Integration | Vitest + Postgres + Mailpit (compose.dev) | DAL: issue transaction (number, snapshots incl. template, tax lines, audit in one txn), rollback leaves no gap, **20 concurrent issues → 1..20**, `recalculateBalances` after payment/credit note/void, archive filter extension, allow-list hook rejects and creates nothing; `sendDocumentEmail` delivers to Mailpit with the PDF attached, logs `EmailMessage`, sets `sentAt` once |
| Documents | Vitest | Render fixtures to PDF, extract text (`pdf-parse`) and assert numbers/words/statements; hash stability for identical input |
| E2E | Playwright (Chromium) | Sign-in via test-only email/password provider → profile → client → invoice → issue → download PDF → verify page (valid, hash matches, void shows void) → payment → credit note → send by email (asserted in Mailpit) → change the template in Settings → previously issued PDF hash unchanged → CSV and XLSX export parse back correctly |
| Ops | shell in CI | `restore-drill.sh`: seed → backup → wipe → restore → row counts and one PDF hash match |

Coverage gate 90% on `src/lib/**`.

---

## 20. Observability and health

- `pino` JSON logs to stdout with `requestId` (from Caddy's `X-Request-Id` or generated), user id, route, duration; PII (emails, tokens) redacted via `pino` `redact`.
- `/api/health/live`: returns `200 {"ok":true}` with no I/O.
- `/api/health/ready`: `SELECT 1` and `storage.exists(".ready")` with 1 s timeouts; 503 on failure.
- Optional later: OpenTelemetry exporter behind `OTEL_EXPORTER_OTLP_ENDPOINT` (Next has first-party support).

---

## 21. Operations runbook (Compose)

```bash
# First run (from the repo root, or any directory holding compose.yml + docker/ + .env)
cp .env.example .env && scripts/gen-secrets.sh >> .env     # then edit APP_URL, APP_DOMAIN, AUTH_*, providers
docker compose up -d                                       # migrate runs, app waits, caddy gets a cert
docker compose logs -f app

# Upgrade
sed -i 's/^OKINVO_VERSION=.*/OKINVO_VERSION=1.1.0/' .env
docker compose pull && docker compose up -d

# Backups
docker compose exec backup /backup/backup.sh --now
docker compose run --rm backup /backup/restore.sh /backups/pg/okinvo-<ts>.dump /backups/storage/storage-<ts>.tgz

# Rotate the field-encryption key
docker compose run --rm app node scripts/rotate-key.js --old "$OLD" --new "$NEW"

# Move to another host
# copy .env + volumes (docker run --rm -v okinvo_pg_data:/from -v $PWD:/to alpine tar czf /to/pg.tgz -C /from .) or use the backup files
```

---

## 22. Milestones

| # | Milestone | Deliverable |
|---|---|---|
| M0 | **Scaffold** | Repo tooling (pnpm, TS7, ESLint, Prettier, Vitest, Playwright), `scripts/design-tokens.ts` → `tokens.css` (dark + light) from DESIGN.md, Next 16 app shell with shadcn mapped to the tokens and the no-flash theme script, Prisma 7 schema + first migration (incl. partial indexes), `env.ts`, Dockerfile + compose (all services), `ci.yml`, Renovate. `docker compose up` shows a sign-in page. |
| M1 | **Identity & master data** | Better Auth with allow-list and all five providers; sessions page; Settings → Account (timezone, theme); issuer profiles (with uploads + encryption), clients, services, payment methods; audit log; archive extension. |
| M2 | **Invoices** | Builder with live preview; tax engine (all regimes, minor-unit rounding); totals; issue transaction with numbering; `ledger` template + template config + snapshot; Settings → Templates (choose + core customisation); PDF render + storage; download; verification page with QR; void & reissue; register with filters. |
| M3 | **Money in, mail out** | Payments ledger with TDS/FX/fees/receipts; balances; derived statuses; amount-based credit notes (apportioned tax, PDF); dashboard; SMTP transport, Settings → Email, send composer with Mailpit-backed tests. |
| M4 | **Exports, data & polish** | Eight CSV/XLSX datasets; ZIP bundles; Settings → Data; backup service + restore drill in CI; `classic` and `compact` templates; full template customisation UI with import/export. |
| M5 | **Hardening & K8s** | Nonce CSP, rate limits, container hardening, `release.sh`, first tagged image on Docker Hub, Kustomize base + overlays validated on a local cluster (kind/k3d). |
| v1.1 | **Delivered 2026-10-15** | Shell and identity (brand, accents, avatars, collapsible sidebar, mobile drawer), onboarding wizard and account preferences, roles and members, products and profile tags, six templates with the vendored font catalogue and header bands, input charset, 115 UI languages, API keys + REST v1 + OpenAPI + SDK + MCP + skill, legal pages, cookie notice, status page, DOCX copies, share links and protected copies, translated documents with script fonts, e-invoicing (GST JSON, IRN connectors, EN 16931 CII/UBL, Factur-X), documentation site (`docs/wiki`, Wiki.js profile). Plan: `docs/superpowers/plans/2026-10-02-v1-1-full-scope.md`. |
| v1.2 | | Payment reminders through the composer, import from `data.json`. |

Each milestone ends with its tests green in CI and a short `docs/changelog.md` entry.

**Status (2026-10-15):** M0 to M5 delivered on `feat/initial-version-okinvo` and v1.1 on `feature/v1-core-onboarding-ui-mcp` (see `docs/changelog.md`). Deviations recorded along the way: TypeScript 6 (TS 7 blocked by typescript-eslint), hand-written UI primitives instead of `shadcn add`, a `postgres` rate-limit store wired in M5, `AUTH_PASSWORD_SIGNIN` for IdP-less installs and CI, the NIC IRP connector verified against recorded fixtures only, and the Compact-ICC sRGB profile as the Factur-X output intent.

---

## 23. Decisions log

Resolved 2026-10-01. Kept so the reasoning survives.

| # | Question | Decision | Why |
|---|---|---|---|
| 1 | Prisma vs Drizzle | **Prisma 7 stays.** The three raw-SQL spots - two partial unique indexes (migration SQL), the `DocumentSequence` upsert (`numbering/allocate.ts`), the date-string result extension (`lib/db.ts`) - are isolated, ~40 lines in total and already written in this plan. | Prisma returns typed `Decimal`s, which directly serves money-correctness (Drizzle's `numeric` returns strings - one more place to slip); Prisma Studio; nested writes for line items; the schema is already designed in it. Tripwire: a fourth raw-SQL need before M2 → revisit. |
| 2 | Credit-note line items | **Cut.** Amount + reason; tax lines apportioned pro-rata from the invoice (`money/apportion`, largest-remainder). `CreditNoteItem` removed; `CreditNoteTaxLine` kept. A line picker only computes the amount. | Freelancer credit notes are "cancel milestone 2" or "10 % goodwill" - amounts. Reportable tax is preserved. |
| 3 | GST rounding | **Per line, per component, half-up to minor units; aggregate afterwards; whole-rupee via `roundingAdjustment`.** | Matches mainstream Indian packages; tables always foot; rate-wise summaries stay within e-invoice ±1 tolerance. Fixtures are written to this rule. |
| 4 | Timezone | **Per signed-in user** (`User.timezone`, Better Auth additional field, auto-detected from the browser at first sign-in, editable in Settings → Account). `IssuerProfile.timezone` removed; no `APP_TIMEZONE`. | Your call; "today" belongs to the person clicking. Document dates are calendar dates regardless. |
| 5 | Zero-decimal currencies | **Supported for 0- and 2-minor-unit currencies** via `minorUnits()` from `Intl`; `roundMoney(v, currency)` replaces `round2`. The seven three-decimal currencies are rejected by `CurrencySchema` (money columns stay `Decimal(14,2)`). | Twenty lines removes a footgun; 3-dp support would mean widening every money column for currencies you will never bill in. |
| 6 | Better Auth API drift | **Verified against the docs** (§9.1). One correction: `APIError` is imported from `better-auth/api`. | - |
| 7 | TypeScript 7 readiness | Try 7.0 at M0; pin 6.x if any tool in the chain objects; Renovate moves it later. | Unchanged from before. |
| 8 | SMTP | **Both env and Settings**, Settings win; the composer drafts an editable mail with the stored PDF attached and sends only on click; `mailto:` fallback without SMTP (§12.4). | Your call. |
| 9 | Templates | **Three built-ins; parameterised customisation in Settings → Templates; optional per-issuer override; snapshotted at issue.** No user-coded templates in v1 (§12.2). | Your call. |
| 10 | LAN-only deployments | `tls internal` documented in §16.3; no separate override file until someone needs it. | - |
| 11 | Receipts as PDFs | Served as `attachment` only. Accepted. | - |
| 12 | Kubernetes storage class | Assume the cluster default; `storageClassName` is a one-line Kustomize patch in the overlay. | - |

---

## 24. Design system - applying `DESIGN.md` to the app

`DESIGN.md` (design.md format, front-matter tokens + prose) is the **source of truth for the UI**. It is an extraction of Linear's *marketing* site, so this section says what is adopted verbatim, what is remapped for a dense application, and what is added. Your §10 "Linear Design System UI Specification" (pasted 2026-10-01, preserved as an addendum in `IMPLEMENTATION_PLAN.md`) fixed the three open items - status palette, theme modes (dark / inverse light / system) and font roles - and §24.5 turns them into AA-verified tokens. The `design.md` schema (checked against the package README, 0.4.0) is a flat `colors:` map with no theme modes, so at M0 the status tokens go into `DESIGN.md`'s front matter and the light palette goes into a sibling **`DESIGN.light.md`** with identical token names; both files are linted (the linter also checks WCAG contrast on `components:` entries, which is free regression coverage for §24.4-24.5) and the generator merges them.

### 24.1 Pipeline

- `scripts/design-tokens.ts` parses the YAML front matter of `DESIGN.md` (dark, canonical) and `DESIGN.light.md` (light overrides, same token names) and writes `src/app/tokens.css`: a Tailwind 4 `@theme` block (`--color-canvas`, `--color-surface-1`, `--color-ink-subtle`, `--color-hairline`, `--radius-md`, `--font-sans`, …) plus `--text-*` entries for the type scale. DESIGN.md's spacing scale is **not** emitted as named `--spacing-*` tokens: `sm/md/lg/xl` collide with Tailwind's container sizes inside `max-w-*`/`w-*` (M0 found `max-w-sm` resolving to 12 px), and the scale is 4 px-based, i.e. exactly Tailwind's numeric utilities - xxs=1, xs=2, sm=3, md=4, lg=6, xl=8, xxl=12, section=24 (`p-3` is DESIGN.md `sm`); `tokens.css` carries the mapping as comments and the generator rejects non-4 px values. Both themes are emitted: `:root` carries dark, `[data-theme="light"]` the light overrides, so utilities are theme-agnostic. Components use only the generated utilities (`bg-surface-1`, `text-ink-subtle`, `border-hairline`, `rounded-md`). **No hex literals in components**; ESLint rule `no-restricted-syntax` on `#[0-9a-f]{3,8}` in `src/components` and `src/app` enforces it.
- CI runs `npx @google/design.md lint DESIGN.md` and `pnpm design:tokens --check` (regenerate and diff), so a token edit without a regenerated `tokens.css` fails the build.
- `src/app/globals.css` imports `tokens.css` and maps tokens onto shadcn/ui's semantic variables (§24.3). shadcn components are generated once (`pnpm dlx shadcn@latest add …`) and then owned by the repo.

### 24.2 Adopted verbatim

Colour tokens (canvas, the four-step surface ladder, three hairlines, the four inks, lavender primary/hover/focus, success), the radius scale (`md` 8px for every button and input, `lg` 12px for cards, `pill` for status pills), the 4px spacing base, the do/don't list (lavender is scarce; no second chromatic accent on chrome; no gradients or shadows - depth is the surface ladder + hairlines; never `#000000` as canvas; never pill-round buttons), and the elevation table (focus ring = 2px `primary-focus` at 50 %).

### 24.3 Token → shadcn/Tailwind mapping

| shadcn variable | DESIGN.md token | Notes |
|---|---|---|
| `--background` / `--foreground` | `canvas` / `ink` | page and sidebar |
| `--card` / `--card-foreground` | `surface-1` / `ink` | + 1px `hairline` border, `rounded-lg` |
| `--popover` | `surface-3` | dropdowns, comboboxes, command palette; 1px `hairline-strong` |
| `--muted` / `--muted-foreground` | `surface-2` / `ink-subtle` | table header row, hovered rows, empty states |
| `--accent` | `surface-2` | hover/selected in menus and lists |
| `--border` / `--input` | `hairline` / `hairline-strong` | |
| `--ring` | `primary-focus` | 2px at 50 % opacity, per DESIGN.md elevation level 4 |
| `--primary` / `--primary-foreground` | `primary` / `on-primary` | one primary button per view |
| `--secondary` | `surface-1` + `hairline` border | DESIGN.md `button-secondary` |
| `--destructive` | `semantic-danger-fill` (§24.5) | confirm-dialog fill only; elsewhere danger is text/border |
| `--radius` | `rounded.md` = `0.5rem` | |
| dialog overlay | `semantic-overlay` at 60 % (40 % in light) | |

The mapping is identical in both themes; only the token values behind it change (§24.5).

Buttons map 1:1 onto DESIGN.md's `button-primary` / `-secondary` / `-tertiary` / `-inverse` (all 8px 14px padding, 32px tall, `rounded-md`); inputs onto `text-input` (8px 12px, 32px tall). `status-badge` is the base of every status pill.

### 24.4 Contrast (measured 2026-10-01, WCAG 2.1)

| Pair | Ratio | Consequence |
|---|---|---|
| `primary #5e6ad2` on `canvas` | 4.44 | OK for buttons, borders, icons, active-nav indicator (≥ 3:1 for UI); **not** for body-size link text |
| `link #828fff` on `canvas` | 7.27 | link text colour in the app |
| white on `primary-hover #525dc7` | 5.60 | hovered primary button label (DESIGN.md's original hover `#828fff` was 2.87:1 and was changed) |
| `ink-subtle` on `canvas` / `surface-1` | 6.42 / 5.86 | secondary text: fine |
| `ink-tertiary` on `canvas` | 3.62 | disabled text and footnotes only - never for information the user must read |
| `semantic-success` on `canvas` | 6.58 | fine |
| white on `primary` | 4.70 | primary button label: fine |

### 24.5 Additions to `DESIGN.md` (approved via your §10; values verified 2026-10-01)

**Status palette (your §10.1).** Three semantic colours and no info blue - issued/sent stay neutral, which keeps the chrome as restrained as DESIGN.md wants. Your dark values pass everywhere; on light surfaces all three fail AA as text (3.17 / 2.23 / 3.48 on white), so each gets a darker light-mode twin:

| Token | Dark | On canvas / s1 | Light | On white / light s1 | Use |
|---|---|---|---|---|---|
| `semantic-success` | `#27a644` | 6.58 / 6.01 | `#1a7f37` | 5.08 / 4.69 | paid, test email OK, backup OK |
| `semantic-warning` | `#f2994a` | 9.37 / 8.55 | `#c2410c` | 5.18 / 4.78 | partially paid, LUT expiring, SMTP not configured |
| `semantic-danger` | `#eb5757` | 5.99 / 5.47 | `#b91c1c` | 6.47 / 5.98 | overdue, void, failed email, validation errors |
| `semantic-danger-fill` | `#c83a3a` | white label 5.09 | `#c83a3a` | white label 5.09 | destructive confirm-button fill only - `#eb5757` under a white label is 3.48 and fails |

Status pills (Linear product style): colour at 12 % alpha as background, colour as text, `rounded.pill`, `caption` type, 2px 8px padding. Mapping: `DRAFT` → `ink-subtle` on `surface-2` (the existing `status-badge`); `ISSUED` → `ink-muted` on `surface-2`; `SENT` → the same with a mail icon; `PARTIALLY_PAID` → warning; `PAID` → success; `OVERDUE` → danger; `VOID` → danger per your spec, with the number struck through (if red reads too loud for a non-actionable state, `ink-tertiary` is a one-line change).

**App type scale.** The marketing scale (80/56/40 px) is unused in the app except the sign-in headline (`display-md`). App tokens, all Inter, negative tracking kept at the top and dropped at body per DESIGN.md's principle:

| Token | Size / weight / line-height / tracking | Use |
|---|---|---|
| `app-title` | 20 / 600 / 1.2 / −0.4px | page titles |
| `app-section` | 16 / 600 / 1.3 / −0.2px | card and section headings |
| `app-body` | 14 / 400 / 1.5 / 0 | default UI text (Linear's product base) |
| `app-label` | 14 / 500 / 1.3 / 0 | form labels, table headers (`ink-subtle`) |
| `app-table` | 13 / 400 / 1.4 / 0 | dense table cells |
| `app-caption` | 12 / 400 / 1.4 / 0 | meta, pills, helper text |
| `app-mono` | 13 / 400 JetBrains Mono | invoice and credit-note numbers, dates, tokens, hashes - per your §10.2 |
| `app-amount` | 13 / 500 JetBrains Mono, `tabular-nums` | every money cell and total, right-aligned - per your §10.2 |

**Fonts (your §10.2).** `Inter` variable for display and body, with the `SF Pro Display, -apple-system, system-ui, Segoe UI, Roboto` fallback stack DESIGN.md documents; `JetBrains Mono` (fallback `SF Mono, ui-monospace, Menlo`) for currency figures, invoice numbers and dates. Self-hosted via `@fontsource-variable/inter 5.3.0` and `@fontsource/jetbrains-mono 5.3.0`. Inter is already the PDF body font, so UI and documents share a voice. `font-feature-settings: "tnum"` on the Inter numerals that remain (dashboard tiles).

**Density.** Sidebar 240px (collapsible to a 64px icon rail, state in the `okinvo.sidebar` cookie; a drawer behind a menu button below `md`), no top bar: a 48px breadcrumb + actions row inside the content area, Linear-style. Content max-width 1280px. Table rows 40px (36px in compact mode), inputs and buttons 32px tall, card padding 24px (16px in dense panels), builder split 7 : 5 with the preview sticky. Command palette (`⌘K`: new invoice, go to client, search numbers) on `surface-3`: M4, optional.

**Theme modes (your §10.1): dark, inverse light, system - all in v1.** Dark is DESIGN.md verbatim. The inverse light theme starts from your three values (`#ffffff` canvas, `#f5f6f6` surface-1, `#000000` ink) and fills in the rest so every text pair is AA-verified:

| Token | Dark (DESIGN.md) | Light | Light contrast | Note |
|---|---|---|---|---|
| `canvas` | `#010102` | `#ffffff` | - | your value |
| `surface-1` | `#0f1011` | `#f5f6f6` | - | your value (DESIGN.md `inverse-surface-1`) |
| `surface-2` | `#141516` | `#eeeff0` | - | hover/lift must get *darker* on light, so not the `#f6f7f7` inverse token |
| `surface-3` | `#18191a` | `#ffffff` + `hairline-strong` | - | popovers float on white with a border; still no shadows |
| `surface-4` | `#191a1b` | `#e8e9eb` | - | |
| `hairline` / `-strong` / `-tertiary` | `#23252a` / `#34343a` / `#3e3e44` | `#e6e7e9` / `#d5d7db` / `#c4c7cc` | - | |
| `ink` | `#f7f8f8` | `#000000` | 21.0 | your value (DESIGN.md `inverse-ink`) |
| `ink-muted` | `#d0d6e0` | `#3c3f44` | 10.57 | |
| `ink-subtle` | `#8a8f98` | `#62666d` | 5.77 / 5.33 on s1 | `#8a8f98` on white is 3.25 - fails - so it moves one step darker |
| `ink-tertiary` | `#62666d` | `#8a8f98` | 3.25 | disabled and footnotes only, same rule as dark |
| `primary` | `#5e6ad2` | `#5e6ad2` | 4.70 / 4.34 on s1 | unchanged: buttons, focus ring, active-nav indicator |
| `link` | `#828fff` | `#4a55bd` | 7.27 dark / 6.32 light | body-size link text |
| `primary-hover` | `#525dc7` | `#4f5bc4` | white label 5.60 / 5.79 | darker on hover in both themes so the white label stays AA |
| `semantic-*` | status table above | status table above | | |
| `semantic-overlay` | `#000000` @ 60 % | `#000000` @ 40 % | | |

Mechanics: `tokens.css` emits `:root` (dark) and `[data-theme="light"]`. "System" resolves `data-theme` from `prefers-color-scheme` in a tiny inline script before first paint (no flash) and follows OS changes live. The choice lives on `User` (Settings → Account) and is mirrored to a cookie so the server renders the right theme on the first byte. The Playwright screenshot suite runs once per theme, so a component that only works in dark fails CI.

### 24.6 App components (shadcn/ui, styled from the tokens)

| Component | Treatment |
|---|---|
| Sidebar nav | `canvas`; items `app-body` `ink-subtle`, active item `surface-2` background + `ink` text + 2px `primary` left indicator (the "link emphasis" use DESIGN.md allows); section eyebrows in `eyebrow` type |
| Registers (tables) | `hairline` row rules, header `app-label` on `surface-2`, hover `surface-2`, selected `surface-3`; amounts `app-amount` right-aligned; dates and document numbers in `app-mono`; status pills per §24.5 |
| Forms | inputs per `text-input`; labels `app-label`; helper text `app-caption` `ink-subtle`; errors `semantic-danger` text + border; required marker in `ink-subtle`, not lavender |
| Builder | left form on `canvas`, right preview panel on `surface-1` with `hairline` and `rounded-xl` (DESIGN.md's product-screenshot frame - the document *is* the protagonist here) |
| Cards / stat tiles | `surface-1`, `hairline`, `rounded-lg`, 24px; dashboard figures in `app-title` with tabular numerals |
| Sheet / drawer | `surface-1`, `hairline-strong` edge, 200 ms slide; the mobile navigation drawer is the sidebar in a left sheet with a close button |
| User menu / avatar | avatar: circle, `surface-3` with initials in `app-label` until a photo is uploaded (cropped to a circle, re-encoded PNG, `UPLOAD_MAX_IMAGE_MB`); the sidebar footer holds the theme switch and the user menu (account, sign out) |
| Accent | `primary`, `primary-hover`, `primary-focus` and `link` come from the eight `accent-<id>-*` colour sets in `DESIGN.md` / `DESIGN.light.md`, applied as `:root[data-accent="<id>"]` overrides in `tokens.css`; mint is the default; chosen under Settings → Appearance, mirrored to the `okinvo.accent` cookie so the first paint is right; a ninth, custom swatch stores `custom-<rrggbb>` and applies the four `--accent-custom-*` variables derived in `src/lib/accent.ts` through `:root[data-accent="custom"]` |
| Dialog | `surface-2`, `hairline-strong`, overlay 60 %; destructive confirm uses `semantic-danger-fill` |
| Dropdown / combobox / date picker | `surface-3`, `hairline-strong`, `rounded-md`; selected row `surface-4` |
| Tabs / segmented control | `pricing-tab-default` / `-selected` tokens (pill on `surface-2`) |
| Toast | `surface-2`, 3px status-colour left rail, `app-body` |
| Empty state | `ink-subtle` text, Lucide icon at 1.5px stroke, one `button-secondary` |
| Skeleton | `surface-2` blocks, shimmer off under `prefers-reduced-motion` |
| Icons | Lucide, 16px in rows and buttons, 20px in nav, 1.5px stroke (matches Linear's weight) |

### 24.7 Motion

150 ms ease-out on hover/focus, 200 ms on drawers/dialogs/popovers, none on the live preview (it is a document, not a widget). `prefers-reduced-motion` disables everything non-essential. `motion` only where CSS transitions can't express it (list reorder in the line-item editor).

### 24.8 UI vs documents

`DESIGN.md` governs the app. PDFs are paper: always light, regardless of theme. The `ledger` template borrows Inter, weight-600 headings with slight negative tracking, `#5e6ad2` as the default accent (rules, labels), 8px logo corner radius and hairline table rules in a paper-appropriate grey; that is the whole relationship. `classic` and `compact` do not reference DESIGN.md.

### 24.9 Sign-in page

The one marketing-like surface: `canvas`, `display-md` headline, provider buttons as `button-secondary` with the provider mark, lavender only on the okinvo brand mark. No screenshots, no gradients.
