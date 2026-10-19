# okinvo: Production Implementation, DevOps & Security Architecture Specification

`okinvo` is a self-hostable, full-lifecycle Invoice Management System (IMS) engineered for freelancers and contractors operating as independent professionals or corporate entities. This document outlines the end-to-end technical blueprint, covering pinned component versions, database schemas, multi-provider OIDC/OAuth authentication, SeaweedFS distributed blob storage, field-level invoice visibility customization, container and Kubernetes DevOps runbooks, and zero-trust security hardening.

---

## 1. Pinned Technology Stack & Component Versions

| Component | Technology | Target / Pinned Version | Architectural Role |
| --- | --- | --- | --- |
| **App Runtime** | Node.js (Alpine Base) | `20.18.1 LTS` | Minimal surface area, hardened V8 runtime. |
| **Framework** | Next.js (App Router) | `15.1.4` | Server Actions, multi-page sub-routing, streaming SSR. |
| **Language** | TypeScript | `5.7.3` | Strict type safety (`strict: true`, `noImplicitAny: true`). |
| **Database** | PostgreSQL | `16.6-alpine` | Relational storage, ACID transactions, native JSONB. |
| **Object Storage** | SeaweedFS | `3.79` | High-performance distributed blob store with native S3 API. |
| **Cache & Sessions** | Redis | `7.4-alpine` | Rate limiting, distributed lock management, session store. |
| **ORM** | Prisma ORM | `6.2.1` | Type-safe queries, migration engine, connection pooling. |
| **Authentication** | Auth.js (NextAuth v5) | `5.0.0-beta.25` | OIDC & OAuth engine (Google, GitHub, Keycloak, Casdoor, Custom OIDC). |
| **Styling** | Tailwind CSS | `3.4.17` | Configured with canonical Linear dark/light design tokens. |
| **UI Primitives** | Radix UI | `^1.1.x` | Accessible, headless unstyled component primitives. |
| **Icons** | Lucide React | `0.469.0` | Vector stroke icons aligned with Linear line weight. |
| **Animation** | Framer Motion | `11.15.0` | Route transitions, micro-interactions, live preview updates. |
| **PDF Engine** | `@react-pdf/renderer` | `4.1.6` | Vector-sharp PDF rendering with embedded fonts and SVGs. |
| **DOCX Engine** | `docx` | `9.0.3` | Native Office Open XML `.docx` compilation. |
| **Signature Pad** | `react-signature-canvas` | `1.1.0` | HTML5 smooth vector-curve signature capture. |
| **S3 SDK** | `@aws-sdk/client-s3` | `3.722.0` | SeaweedFS S3-compatible integration client. |
| **Validation** | Zod | `3.24.1` | Runtime schema validation for forms, APIs, and environments. |

---

## 2. High-Level System Architecture

```
                                  INTERNET / VPN
                                        │
                                        ▼
                   ┌─────────────────────────────────────────┐
                   │    Reverse Proxy / Ingress Controller   │
                   │      (Nginx / Traefik / Envoy)          │
                   │      TLS Termination, WAF, Rate Limit   │
                   └────────────────────┬────────────────────┘
                                        │
                         ┌──────────────┴──────────────┐
                         ▼                             ▼
              ┌─────────────────────┐       ┌─────────────────────┐
              │    okinvo App Pod   │       │  SeaweedFS S3 Port  │
              │   (Next.js Server)  │       │      (:8333)        │
              └──────────┬──────────┘       └──────────┬──────────┘
                         │                             │
         ┌───────────────┼───────────────┐             │
         ▼               ▼               ▼             ▼
┌────────────────┐┌─────────────┐┌──────────────┐┌──────────────┐
│  PostgreSQL 16 ││ Redis Cache ││ External     ││ SeaweedFS    │
│  (Port 5432)   ││ (Port 6379) ││ Identity     ││ Filer/Volume │
│  Data & Schema ││ Sessions    ││ Providers    ││ Blob Storage │
└────────────────┘└─────────────┘└──────────────┘└──────────────┘

```

---

## 3. Multi-Page Sub-URL Map

`okinvo` avoids modal-layered single-page architectures in favor of distinct, bookmarkable sub-URLs:

```
/
├── /invoices
│   ├── /new                               (Split-screen builder: form + live reactive preview)
│   ├── /[id]                              (Invoice overview, status, PDF/DOCX downloads, action bar)
│   ├── /[id]/edit                         (Version-aware editing interface with revision memo)
│   ├── /[id]/versions                     (Side-by-side snapshot comparison & audit trail)
│   └── /[id]/payments                     (Manual payment ledger & transaction balance tracker)
├── /clients
│   ├── /                                  (Client directory index with search & metrics)
│   ├── /new                               (Add new client profile with tax IDs & address)
│   ├── /[id]                              (Client profile, lifetime billing metrics, history)
│   └── /[id]/edit                         (Client profile editor)
├── /services
│   ├── /                                  (Service inventory catalog with SAC codes & rates)
│   ├── /new                               (Create new standard service entry)
│   └── /[id]/edit                         (Edit standard service entry)
├── /credit-notes
│   ├── /                                  (Directory of issued credit notes)
│   ├── /new                               (Issue linked credit note against an invoice)
│   └── /[id]                              (Credit note details & export)
├── /verify/[token]                        (Public verification endpoint for invoice QR codes)
├── /auth
│   ├── /signin                            (Custom Linear-styled multi-provider login screen)
│   └── /error                             (Authentication error handler)
└── /settings
    ├── /profiles                          (Manage Personal Contractor vs Company profiles)
    ├── /profiles/new                      (Add new Contractor or Company profile)
    ├── /profiles/[id]/edit                (Edit addresses, tax IDs, GSTIN, CIN, logo, stamp, sign)
    ├── /payment-methods                   (Manage Bank Accounts, Wise, Revolut, UPI profiles)
    └── /security                          (Manage active sessions, audit logs, API keys)

```

---

## 4. Comprehensive Database Schema (Prisma)

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

// -------------------------------------------------------------
// ENUMS
// -------------------------------------------------------------

enum UserRole {
  OWNER
  ADMIN
  MEMBER
  VIEWER
}

enum IssuerType {
  INDIVIDUAL  // Freelancer / Independent Contractor / Sole Proprietor
  COMPANY     // LLP, Private Limited, LLC, Corporation
}

enum TaxRegime {
  INDIA_GST
  UK_VAT
  US_SALES_TAX
  MANUAL
}

enum InvoiceStatus {
  DRAFT
  ISSUED
  SENT
  PARTIALLY_PAID
  PAID
  OVERDUE
  VOID
  CREDITED
}

enum PaymentMethodType {
  BANK_TRANSFER
  UPI
  WISE
  REVOLUT
  PAYPAL
  CUSTOM
}

enum UnitType {
  HOUR
  DAY
  FIXED
  MILESTONE
  UNIT
}

enum CreditNoteStatus {
  ISSUED
  APPLIED
  VOID
}

// -------------------------------------------------------------
// 1. AUTHENTICATION & MULTI-TENANT RBAC
// -------------------------------------------------------------

model User {
  id            String     @id @default(cuid())
  name          String?
  email         String     @unique
  emailVerified DateTime?
  image         String?
  role          UserRole   @default(OWNER)
  isActive      Boolean    @default(true)
  
  accounts      Account[]
  sessions      Session[]
  auditLogs     AuditLog[]

  createdAt     DateTime   @default(now())
  updatedAt     DateTime   @updatedAt
}

model Account {
  id                String  @id @default(cuid())
  userId            String
  type              String
  provider          String  // google, github, keycloak, casdoor, custom-oidc
  providerAccountId String
  refresh_token     String? @db.Text
  access_token      String? @db.Text
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String? @db.Text
  session_state     String?

  user              User    @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerAccountId])
  @@index([userId])
}

model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique
  userId       String
  expires      DateTime
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
}

model VerificationToken {
  identifier String
  token      String   @unique
  expires    DateTime

  @@unique([identifier, token])
}

// -------------------------------------------------------------
// 2. ISSUER PROFILES (PERSONAL CONTRACTOR & COMPANY)
// -------------------------------------------------------------

model IssuerProfile {
  id               String       @id @default(cuid())
  type             IssuerType   @default(INDIVIDUAL)
  isDefault        Boolean      @default(false)
  profileLabel     String       // E.g., "Personal Freelance", "Okinvo Tech Pvt Ltd"

  legalName        String       // Personal full name OR Registered Company Name
  tradeName        String?      // Brand or DBA name
  designation      String?      // E.g., "Independent Consultant" or "Director"
  email            String
  phone            String?
  website          String?

  // Address JSON: { line1, line2, city, state, postalCode, country }
  address          Json

  // Tax & Legal Identifiers
  panNumber        String?      // Personal or Corporate PAN
  gstin            String?      // Goods & Services Tax ID
  cinNumber        String?      // Corporate Registration Number
  ukVatNumber      String?      // UK VAT ID
  usEin            String?      // US EIN / SSN
  lutNumber        String?      // India Export Letter of Undertaking

  // SeaweedFS Asset URLs
  logoUrl          String?      // Brand logo or contractor avatar
  signatureUrl     String?      // Transparent PNG signature
  stampUrl         String?      // Official company seal/stamp

  createdAt        DateTime     @default(now())
  updatedAt        DateTime     @updatedAt
  deletedAt        DateTime?    // Soft delete

  invoices         Invoice[]

  @@index([type])
  @@index([isDefault])
}

// -------------------------------------------------------------
// 3. CLIENT & PARTNER DIRECTORY
// -------------------------------------------------------------

model Client {
  id                 String       @id @default(cuid())
  organizationName   String
  contactPerson      String?
  email              String
  phone              String?
  
  billingAddress     Json         // { line1, line2, city, state, postalCode, country }
  shippingAddress    Json?

  country            String
  defaultCurrency    String       @default("USD")
  taxIdentifier      String?      // Client GSTIN, UK VAT, or US EIN/SSN
  placeOfSupply      String?      // State / Province / Country code
  paymentTermsDays   Int          @default(30)
  notes              String?

  createdAt          DateTime     @default(now())
  updatedAt          DateTime     @updatedAt
  deletedAt          DateTime?

  invoices           Invoice[]

  @@index([organizationName])
}

// -------------------------------------------------------------
// 4. SERVICE INVENTORY CATALOG
// -------------------------------------------------------------

model ServiceItem {
  id             String        @id @default(cuid())
  name           String
  description    String?
  defaultRate    Decimal       @db.Decimal(12, 2)
  currency       String        @default("INR")
  unitType       UnitType      @default(HOUR)
  sacHsnCode     String?       // E.g., 998311 for IT Services
  defaultTaxRate Decimal       @default(0.00) @db.Decimal(5, 2)
  isActive       Boolean       @default(true)

  createdAt      DateTime      @default(now())
  updatedAt      DateTime      @updatedAt
  deletedAt      DateTime?

  invoiceItems   InvoiceItem[]

  @@index([name])
}

// -------------------------------------------------------------
// 5. PAYMENT METHODS STORE
// -------------------------------------------------------------

model PaymentMethodProfile {
  id             String            @id @default(cuid())
  name           String            // E.g., "HDFC Current (INR)", "Wise USD"
  type           PaymentMethodType @default(BANK_TRANSFER)
  currency       String?           // Target currency or null for universal
  isDefault      Boolean           @default(false)
  isActive       Boolean           @default(true)
  
  details        Json              // Structured JSON with account details
  instructions   String?

  createdAt      DateTime          @default(now())
  updatedAt      DateTime          @updatedAt
  deletedAt      DateTime?

  invoiceLinks   InvoicePaymentMethodLink[]

  @@index([type])
  @@index([isActive])
}

// -------------------------------------------------------------
// 6. INVOICES
// -------------------------------------------------------------

model Invoice {
  id                 String         @id @default(cuid())
  invoiceNumber      String         @unique // E.g., INV/26-27/001
  
  issuerProfileId    String
  issuerProfile      IssuerProfile  @relation(fields: [issuerProfileId], references: [id])
  
  clientId           String
  client             Client         @relation(fields: [clientId], references: [id])

  // Snapshots frozen upon issuance
  issuerSnapshot     Json?
  clientSnapshot     Json?
  selectedPaymentMethodsSnapshot Json?

  // Field-Level Visibility & Customization Config
  displayConfig      Json

  issueDate          DateTime       @db.Date
  dueDate            DateTime       @db.Date
  status             InvoiceStatus  @default(DRAFT)

  currency           String         @default("USD")
  fxRateToBase       Decimal        @default(1.0000) @db.Decimal(10, 4)

  taxRegime          TaxRegime      @default(INDIA_GST)
  taxDetails         Json?          // { cgst, sgst, igst, vat, isLut, isReverseCharge }

  subtotal           Decimal        @db.Decimal(12, 2)
  discountAmount     Decimal        @default(0.00) @db.Decimal(12, 2)
  taxAmount          Decimal        @default(0.00) @db.Decimal(12, 2)
  tdsRate            Decimal        @default(0.00) @db.Decimal(5, 2)
  tdsAmount          Decimal        @default(0.00) @db.Decimal(12, 2)
  totalAmount        Decimal        @db.Decimal(12, 2)
  netReceivable      Decimal        @db.Decimal(12, 2)
  amountPaid         Decimal        @default(0.00) @db.Decimal(12, 2)
  balanceDue         Decimal        @db.Decimal(12, 2)

  notes              String?
  terms              String?
  signatureUrl       String?
  stampUrl           String?
  verificationToken  String         @unique @default(cuid())

  currentVersion     Int            @default(1)
  createdAt          DateTime       @default(now())
  updatedAt          DateTime       @updatedAt
  deletedAt          DateTime?

  items              InvoiceItem[]
  versions           InvoiceVersion[]
  payments           PaymentTransaction[]
  paymentMethods     InvoicePaymentMethodLink[]
  creditNotes        CreditNote[]

  @@index([issuerProfileId])
  @@index([clientId])
  @@index([status])
}

// -------------------------------------------------------------
// 7. INVOICE LINE ITEMS
// -------------------------------------------------------------

model InvoiceItem {
  id                 String       @id @default(cuid())
  invoiceId          String
  invoice            Invoice      @relation(fields: [invoiceId], references: [id], onDelete: Cascade)
  
  serviceId          String?
  service            ServiceItem? @relation(fields: [serviceId], references: [id])

  description        String
  sacCode            String?
  quantity           Decimal      @default(1.00) @db.Decimal(10, 2)
  unitPrice          Decimal      @db.Decimal(12, 2)
  taxRate            Decimal      @default(0.00) @db.Decimal(5, 2)
  taxAmount          Decimal      @default(0.00) @db.Decimal(12, 2)
  amount             Decimal      @db.Decimal(12, 2)
  isManualOverride   Boolean      @default(false)

  @@index([invoiceId])
}

// -------------------------------------------------------------
// 8. INVOICE <-> PAYMENT METHOD LINK
// -------------------------------------------------------------

model InvoicePaymentMethodLink {
  invoiceId         String
  paymentMethodId   String
  displayOrder      Int                   @default(0)

  invoice           Invoice               @relation(fields: [invoiceId], references: [id], onDelete: Cascade)
  paymentMethod     PaymentMethodProfile  @relation(fields: [paymentMethodId], references: [id])

  @@id([invoiceId, paymentMethodId])
  @@index([invoiceId])
}

// -------------------------------------------------------------
// 9. PAYMENT TRANSACTIONS (MANUAL LEDGER)
// -------------------------------------------------------------

model PaymentTransaction {
  id              String            @id @default(cuid())
  invoiceId       String
  invoice         Invoice           @relation(fields: [invoiceId], references: [id], onDelete: Cascade)

  paymentDate     DateTime          @db.Date
  paymentMethod   PaymentMethodType @default(BANK_TRANSFER)
  referenceNumber String?
  grossAmount     Decimal           @db.Decimal(12, 2)
  feeDeducted     Decimal           @default(0.00) @db.Decimal(12, 2)
  netReceived     Decimal           @db.Decimal(12, 2)
  exchangeRate    Decimal           @default(1.0000) @db.Decimal(10, 4)
  notes           String?
  receiptUrl      String?

  createdAt       DateTime          @default(now())

  @@index([invoiceId])
}

// -------------------------------------------------------------
// 10. INVOICE VERSION HISTORY
// -------------------------------------------------------------

model InvoiceVersion {
  id             String   @id @default(cuid())
  invoiceId      String
  invoice        Invoice  @relation(fields: [invoiceId], references: [id], onDelete: Cascade)

  versionNumber  Int
  snapshotData   Json
  changeReason   String?
  createdAt      DateTime @default(now())

  @@unique([invoiceId, versionNumber])
}

// -------------------------------------------------------------
// 11. CREDIT NOTES
// -------------------------------------------------------------

model CreditNote {
  id               String           @id @default(cuid())
  creditNoteNumber String           @unique
  invoiceId        String
  invoice          Invoice          @relation(fields: [invoiceId], references: [id])

  issueDate        DateTime         @db.Date
  amount           Decimal          @db.Decimal(12, 2)
  reason           String
  status           CreditNoteStatus @default(ISSUED)
  createdAt        DateTime         @default(now())

  @@index([invoiceId])
}

// -------------------------------------------------------------
// 12. AUDIT LOG
// -------------------------------------------------------------

model AuditLog {
  id         String   @id @default(cuid())
  userId     String?
  user       User?    @relation(fields: [userId], references: [id])
  entityType String
  entityId   String
  action     String
  metadata   Json?
  timestamp  DateTime @default(now())

  @@index([entityType, entityId])
  @@index([userId])
}

```

---

## 5. Authentication & OAuth / OIDC Engine

Authentication is powered by **Auth.js v5** (`@auth/core` and `next-auth`), supporting zero-friction identity federation across Google, GitHub, Keycloak, Casdoor, and generic custom OIDC endpoints.

### 5.1 Provider Configuration (`auth.ts`)

```typescript
import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Google from "next-auth/providers/google";
import GitHub from "next-auth/providers/github";
import Keycloak from "next-auth/providers/keycloak";
import type { Provider } from "next-auth/providers";
import { prisma } from "@/lib/prisma";

const providers: Provider[] = [];

// 1. Google OAuth
if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) {
  providers.push(
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
      allowDangerousEmailAccountLinking: true,
    })
  );
}

// 2. GitHub OAuth
if (process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET) {
  providers.push(
    GitHub({
      clientId: process.env.AUTH_GITHUB_ID,
      clientSecret: process.env.AUTH_GITHUB_SECRET,
      allowDangerousEmailAccountLinking: true,
    })
  );
}

// 3. Keycloak OIDC
if (process.env.AUTH_KEYCLOAK_ID && process.env.AUTH_KEYCLOAK_ISSUER) {
  providers.push(
    Keycloak({
      clientId: process.env.AUTH_KEYCLOAK_ID,
      clientSecret: process.env.AUTH_KEYCLOAK_SECRET!,
      issuer: process.env.AUTH_KEYCLOAK_ISSUER, // e.g. https://sso.domain.com/realms/okinvo
    })
  );
}

// 4. Casdoor OIDC
if (process.env.AUTH_CASDOOR_ID && process.env.AUTH_CASDOOR_ISSUER) {
  providers.push({
    id: "casdoor",
    name: "Casdoor",
    type: "oidc",
    issuer: process.env.AUTH_CASDOOR_ISSUER, // e.g. https://casdoor.domain.com
    clientId: process.env.AUTH_CASDOOR_ID,
    clientSecret: process.env.AUTH_CASDOOR_SECRET!,
    wellKnown: `${process.env.AUTH_CASDOOR_ISSUER}/.well-known/openid-configuration`,
    authorization: { params: { scope: "openid profile email" } },
  });
}

// 5. Generic / Custom Enterprise OIDC Provider
if (process.env.AUTH_CUSTOM_OIDC_ISSUER && process.env.AUTH_CUSTOM_OIDC_ID) {
  providers.push({
    id: "custom-oidc",
    name: process.env.AUTH_CUSTOM_OIDC_NAME || "Enterprise SSO",
    type: "oidc",
    issuer: process.env.AUTH_CUSTOM_OIDC_ISSUER,
    clientId: process.env.AUTH_CUSTOM_OIDC_ID,
    clientSecret: process.env.AUTH_CUSTOM_OIDC_SECRET!,
    wellKnown: `${process.env.AUTH_CUSTOM_OIDC_ISSUER}/.well-known/openid-configuration`,
    authorization: { params: { scope: "openid profile email groups" } },
  });
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers,
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  pages: {
    signIn: "/auth/signin",
    error: "/auth/error",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as any).role || "OWNER";
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string;
        (session.user as any).role = token.role as string;
      }
      return session;
    },
  },
});

```

---

## 6. Field-Level Customization & Visibility Engine

Each invoice persists an explicit JSON schema (`displayConfig`) that dictates field rendering across both the reactive web editor and the output documents (PDF/DOCX).

```typescript
export interface InvoiceDisplayConfig {
  issuer: {
    showLogo: boolean;
    showTradeName: boolean;
    showDesignation: boolean;
    showEmail: boolean;
    showPhone: boolean;
    showWebsite: boolean;
    showFullAddress: boolean;
    showPan: boolean;
    showGstin: boolean;
    showCin: boolean;
    showLut: boolean;
    showSignature: boolean;
    showStamp: boolean;
  };
  client: {
    showContactPerson: boolean;
    showEmail: boolean;
    showPhone: boolean;
    showBillingAddress: boolean;
    showShippingAddress: boolean;
    showTaxIdentifier: boolean;
    showPlaceOfSupply: boolean;
  };
  document: {
    showDueDate: boolean;
    showPaymentTerms: boolean;
    showSacCodeColumn: boolean;
    showQuantityColumn: boolean;
    showUnitPriceColumn: boolean;
    showTaxColumn: boolean;
    showTdsBreakdown: boolean;
    showQrVerification: boolean;
    showNotes: boolean;
    showTerms: boolean;
  };
}

```

---

## 7. SeaweedFS Blob Storage & Multi-Driver Architecture

`okinvo` utilizes SeaweedFS as its primary blob storage for digital signatures, stamps, corporate logos, and payment slips. SeaweedFS operates with an integrated S3 gateway on port `8333`.

### 7.1 S3 SDK Storage Adapter (`lib/storage.ts`)

```typescript
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const s3Client = new S3Client({
  region: process.env.S3_REGION || "us-east-1",
  endpoint: process.env.S3_ENDPOINT || "http://seaweedfs:8333",
  forcePathStyle: true, // Required for SeaweedFS S3 gateway
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY || "any",
    secretAccessKey: process.env.S3_SECRET_KEY || "any",
  },
});

const BUCKET = process.env.S3_BUCKET || "okinvo-assets";

export async function uploadBlob(
  fileBuffer: Buffer,
  key: string,
  contentType: string
): Promise<string> {
  await s3Client.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: fileBuffer,
      ContentType: contentType,
    })
  );
  return `${process.env.S3_PUBLIC_BASE_URL || "http://localhost:8333"}/${BUCKET}/${key}`;
}

export async function deleteBlob(key: string): Promise<void> {
  await s3Client.send(
    new DeleteObjectCommand({
      Bucket: BUCKET,
      Key: key,
    })
  );
}

```

---

## 8. Container-Based DevOps Runbook (Docker Compose)

### 8.1 Multi-Stage Production Dockerfile (`Dockerfile`)

```dockerfile
# Stage 1: Dependencies
FROM node:20.18.1-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# Stage 2: Builder
FROM node:20.18.1-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
RUN npx prisma generate
RUN npm run build

# Stage 3: Runner
FROM node:20.18.1-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy standalone build output and static assets
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma

USER nextjs
EXPOSE 3000

CMD ["node", "server.js"]

```

### 8.2 Production Compose (`docker-compose.yml`)

```yaml
version: "3.9"

services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
    image: okinvo-app:latest
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://okinvo_user:SecurePostgresSecret@postgres:5432/okinvo_db?schema=public
      - REDIS_URL=redis://:SecureRedisSecret@redis:6379/0
      - AUTH_SECRET=<generate: openssl rand -hex 32>
      - AUTH_URL=http://localhost:3000
      - S3_ENDPOINT=http://seaweedfs:8333
      - S3_REGION=us-east-1
      - S3_ACCESS_KEY=seaweed_admin_key
      - S3_SECRET_KEY=seaweed_admin_secret
      - S3_BUCKET=okinvo-assets
      - S3_PUBLIC_BASE_URL=http://localhost:8333
    depends_on:
      postgres:
        condition: service_healthy
      seaweedfs:
        condition: service_started
      redis:
        condition: service_healthy
    networks:
      - okinvo-internal
      - okinvo-public

  postgres:
    image: postgres:16.6-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: okinvo_user
      POSTGRES_PASSWORD: SecurePostgresSecret
      POSTGRES_DB: okinvo_db
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U okinvo_user -d okinvo_db"]
      interval: 5s
      timeout: 5s
      retries: 5
    networks:
      - okinvo-internal

  seaweedfs:
    image: chrislusf/seaweedfs:3.79
    restart: unless-stopped
    ports:
      - "8333:8333" # S3 gateway
      - "9333:9333" # Master server
    command: "server -dir=/data -s3 -s3.port=8333 -ip=seaweedfs"
    volumes:
      - seaweed_data:/data
    networks:
      - okinvo-internal
      - okinvo-public

  redis:
    image: redis:7.4-alpine
    restart: unless-stopped
    command: ["redis-server", "--requirepass", "SecureRedisSecret"]
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "-a", "SecureRedisSecret", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5
    networks:
      - okinvo-internal

networks:
  okinvo-internal:
    internal: true
  okinvo-public:
    driver: bridge

volumes:
  postgres_data:
  seaweed_data:
  redis_data:

```

### 8.3 Container Operational Commands

```bash
# 1. Build and start services in the background
docker compose up -d --build

# 2. Execute database migrations inside the app container
docker compose exec app npx prisma migrate deploy

# 3. Initialize default S3 bucket in SeaweedFS
docker compose exec seaweedfs /usr/bin/weed shell -master=localhost:9333
# Inside weed shell:
# > s3.bucket.create -name=okinvo-assets

# 4. View real-time aggregated logs
docker compose logs -f app

# 5. Execute zero-downtime backup of PostgreSQL
docker compose exec postgres pg_dump -U okinvo_user okinvo_db | gzip > backup_$(date +%F).sql.gz

# 6. Restore database from backup
gunzip -c backup_2026-09-30.sql.gz | docker compose exec -T postgres psql -U okinvo_user -d okinvo_db

```

---

## 9. Kubernetes-Based DevOps Runbook (Production Manifests)

The Kubernetes architecture isolates services using declarative manifests with non-root security contexts, dedicated PersistentVolumeClaims, and an ingress routing layer.

### 9.1 Namespace, ConfigMap & Secrets (`01-base.yaml`)

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: okinvo
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: okinvo-config
  namespace: okinvo
data:
  NODE_ENV: "production"
  PORT: "3000"
  S3_ENDPOINT: "http://seaweedfs.okinvo.svc.cluster.local:8333"
  S3_REGION: "us-east-1"
  S3_BUCKET: "okinvo-assets"
  S3_PUBLIC_BASE_URL: "https://assets.okinvo.example.com"
  REDIS_URL: "redis://:SecureRedisSecret@redis.okinvo.svc.cluster.local:6379/0"
---
apiVersion: v1
kind: Secret
metadata:
  name: okinvo-secrets
  namespace: okinvo
type: Opaque
stringData:
  DATABASE_URL: "postgresql://okinvo_user:StrongKubeSecret123!@postgres.okinvo.svc.cluster.local:5432/okinvo_db?schema=public"
  AUTH_SECRET: "<generate: openssl rand -hex 32>"
  S3_ACCESS_KEY: "seaweed_admin_key"
  S3_SECRET_KEY: "seaweed_admin_secret"

```

### 9.2 Stateful Services: PostgreSQL & SeaweedFS (`02-stateful.yaml`)

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: postgres-pvc
  namespace: okinvo
spec:
  accessModes: [ "ReadWriteOnce" ]
  resources:
    requests:
      storage: 20Gi
---
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: postgres
  namespace: okinvo
spec:
  serviceName: postgres
  replicas: 1
  selector:
    matchLabels:
      app: postgres
  template:
    metadata:
      labels:
        app: postgres
    spec:
      containers:
        - name: postgres
          image: postgres:16.6-alpine
          ports:
            - containerPort: 5432
          env:
            - name: POSTGRES_USER
              value: "okinvo_user"
            - name: POSTGRES_PASSWORD
              value: "StrongKubeSecret123!"
            - name: POSTGRES_DB
              value: "okinvo_db"
          volumeMounts:
            - name: postgres-storage
              mountPath: /var/lib/postgresql/data
          resources:
            requests:
              cpu: 250m
              memory: 512Mi
            limits:
              cpu: 1000m
              memory: 2Gi
      volumes:
        - name: postgres-storage
          persistentVolumeClaim:
            claimName: postgres-pvc
---
apiVersion: v1
kind: Service
metadata:
  name: postgres
  namespace: okinvo
spec:
  ports:
    - port: 5432
  selector:
    app: postgres
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: seaweedfs-pvc
  namespace: okinvo
spec:
  accessModes: [ "ReadWriteOnce" ]
  resources:
    requests:
      storage: 50Gi
---
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: seaweedfs
  namespace: okinvo
spec:
  serviceName: seaweedfs
  replicas: 1
  selector:
    matchLabels:
      app: seaweedfs
  template:
    metadata:
      labels:
        app: seaweedfs
    spec:
      containers:
        - name: seaweedfs
          image: chrislusf/seaweedfs:3.79
          args: ["server", "-dir=/data", "-s3", "-s3.port=8333", "-ip=seaweedfs"]
          ports:
            - containerPort: 8333
              name: s3
            - containerPort: 9333
              name: master
          volumeMounts:
            - name: seaweedfs-storage
              mountPath: /data
          resources:
            requests:
              cpu: 200m
              memory: 256Mi
            limits:
              cpu: 1000m
              memory: 1Gi
      volumes:
        - name: seaweedfs-storage
          persistentVolumeClaim:
            claimName: seaweedfs-pvc
---
apiVersion: v1
kind: Service
metadata:
  name: seaweedfs
  namespace: okinvo
spec:
  ports:
    - port: 8333
      name: s3
    - port: 9333
      name: master
  selector:
    app: seaweedfs

```

### 9.3 Application Deployment & Ingress (`03-app.yaml`)

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: okinvo-app
  namespace: okinvo
  labels:
    app: okinvo-app
spec:
  replicas: 2
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  selector:
    matchLabels:
      app: okinvo-app
  template:
    metadata:
      labels:
        app: okinvo-app
    spec:
      securityContext:
        runAsNonRoot: true
        runAsUser: 1001
        runAsGroup: 1001
        fsGroup: 1001
      containers:
        - name: okinvo
          image: okinvo-app:1.0.0
          imagePullPolicy: IfNotPresent
          ports:
            - containerPort: 3000
          envFrom:
            - configMapRef:
                name: okinvo-config
            - secretRef:
                name: okinvo-secrets
          readinessProbe:
            httpGet:
              path: /api/health
              port: 3000
            initialDelaySeconds: 10
            periodSeconds: 5
          livenessProbe:
            httpGet:
              path: /api/health
              port: 3000
            initialDelaySeconds: 20
            periodSeconds: 10
          resources:
            requests:
              cpu: 250m
              memory: 512Mi
            limits:
              cpu: 1500m
              memory: 1536Mi
---
apiVersion: v1
kind: Service
metadata:
  name: okinvo-service
  namespace: okinvo
spec:
  type: ClusterIP
  ports:
    - port: 80
      targetPort: 3000
  selector:
    app: okinvo-app
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: okinvo-ingress
  namespace: okinvo
  annotations:
    kubernetes.io/ingress.class: "nginx"
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
    nginx.ingress.kubernetes.io/proxy-body-size: "25m"
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
spec:
  tls:
    - hosts:
        - invoice.example.com
      secretName: okinvo-tls-cert
  rules:
    - host: invoice.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: okinvo-service
                port:
                  number: 80

```

### 9.4 Kubernetes Operational Runbook

```bash
# 1. Apply all Kubernetes manifests in sequence
kubectl apply -f 01-base.yaml
kubectl apply -f 02-stateful.yaml
kubectl apply -f 03-app.yaml

# 2. Verify pod initialization and health
kubectl get pods -n okinvo -w

# 3. Execute database migration job
kubectl exec -it deployment/okinvo-app -n okinvo -- npx prisma migrate deploy

# 4. Perform rolling release restart
kubectl rollout restart deployment/okinvo-app -n okinvo
kubectl rollout status deployment/okinvo-app -n okinvo

# 5. Stream application production logs
kubectl logs -l app=okinvo-app -n okinvo -f --tail=100

# 6. Database backup via kubectl
kubectl exec statefulset/postgres -n okinvo -- pg_dump -U okinvo_user okinvo_db | gzip > k8s_backup_$(date +%F).sql.gz

```

---

## 10. Comprehensive Security Architecture

`okinvo` adheres to a zero-trust model across infrastructure, transport, application, and database boundaries:

### 10.1 Network Isolation & Traffic Protection

* **Private Pod Networking**: The database (`5432`) and cache (`6379`) do not possess public IP addresses or NodePorts. They are only resolvable within the private cluster network or Docker internal bridge.
* **Strict Ingress Filtering**: All public ingress traffic passes through TLS 1.3 encryption with automatic certificate lifecycle management via Let's Encrypt / `cert-manager`.
* **Container Hardening**: The Next.js container executes under an unprivileged user (`UID 1001`, `nextjs`) with non-root security contexts (`runAsNonRoot: true`), preventing host filesystem escalation.

### 10.2 Application Defense & HTTP Security Headers

Implemented via `next.config.mjs` and middleware:

```javascript
const securityHeaders = [
  { key: "X-DNS-Prefetch-Control", value: "on" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "origin-when-cross-origin" },
  {
    key: "Content-Security-Policy",
    value: "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' https:;",
  },
];

```

### 10.3 Distributed Rate Limiting & Abuse Prevention

* Critical endpoints (`/api/auth/*`, `/invoices/new`, `/api/export/*`) are rate-limited via a Redis-backed sliding window algorithm (maximum 60 requests per minute per IP), preventing credential stuffing, automated scraping, or denial-of-service attempts.

### 10.4 Sensitive Identifier Protection & Compliance

* Tax IDs (PAN, GSTIN, VAT, EIN) and bank coordinates stored in PostgreSQL are access-restricted through parameterized queries via Prisma.
* Document exports enforce the user's explicit `displayConfig` preferences, ensuring no unwanted personal, banking, or corporate credentials leak onto client-facing PDFs or Word documents.
* Invoices feature an unguessable cryptographic token (`verificationToken`) rendering a public authenticity page (`/verify/[token]`) without exposing internal sequential database IDs.

---

## Addendum (provided 2026-10-01): Linear Design System UI Specification

*Supplied by the author after the original document; preserved verbatim. Superseded by `DESIGN.md` and `IMPLEMENTATION_PLAN_v2.md` §24, which adopt these values and add AA-verified light-mode variants.*

## 10. Linear Design System UI Specification

The application UI strictly implements the `Linear-design-analysis` tokens:

### 10.1 Color System

* **Canvas**: `#010102` (deep dark surface with subtle blue tint).
* **Surface Ladder**:
* `Surface 1`: `#0f1011` (card backgrounds, product panels).
* `Surface 2`: `#141516` (lifted panels, hovered cards).
* `Surface 3`: `#18191a` (sub-nav, secondary containers).
* `Surface 4`: `#191a1b` (lifted floating elements).


* **Hairline Borders**:
* Default: `1px solid #23252a`.
* Strong: `1px solid #34343a` (input focus rings, active states).
* Tertiary: `1px solid #3e3e44`.


* **Accent Palette**:
* Signature Lavender: `#5e6ad2`.
* Hover Lavender: `#828fff`.
* Focus Lavender: `#5e69d1` (2px focus ring at 50% opacity).


* **Text / Ink**:
* Primary: `#f7f8f8`.
* Muted: `#d0d6e0`.
* Subtle: `#8a8f98`.


* **Semantic Statuses**:
* Success / Paid: `#27a644`.
* Pending / Partially Paid: `#f2994a`.
* Overdue / Void: `#eb5757`.


* **Theme Modes**: Full Dark mode, clean Inverse Light mode (`#ffffff` canvas, `#f5f6f6` surface-1, `#000000` ink), and System auto-detection.

### 10.2 Typography & Radii

* **Font Stacks**: `Inter` / `SF Pro Display` for display headlines; `Inter` for body; `JetBrains Mono` / `SF Mono` for currency figures, invoice numbers, and dates.
* **Radii Scale**: `rounded-md` (8px) for buttons and inputs; `rounded-lg` (12px) for cards; `rounded-xl` (16px) for preview panels; `rounded-full` for status pills.
