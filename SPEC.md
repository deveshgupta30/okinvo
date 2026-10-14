# okinvo — Product Specification

| | |
|---|---|
| **Status** | Draft v2 — supersedes the product content of `IMPLEMENTATION_PLAN.md` (v1) |
| **Date** | 2026-09-30 |
| **Owner** | deveshgupta30 |
| **Companion docs** | `IMPLEMENTATION_PLAN_v2.md` (how it is built), `CLAUDE.md` (working conventions) |

This document says **what** okinvo does and the rules it must obey. It deliberately avoids technology choices; those live in the implementation plan.

---

## 1. What okinvo is

A self-hosted invoicing system for **one freelancer / contractor** who bills either as an individual or through their own company (or both). It runs entirely on the owner's Docker host or Kubernetes cluster — no managed cloud services. It covers the full lifecycle: client & service catalogue → invoice builder with live preview → issue (immutable PDF + verification QR) → payments ledger → credit notes → exports for the accountant.

### 1.1 Principles

1. **Self-hosted and self-contained.** Postgres, blob storage and the app all run on the owner's infrastructure.
2. **Single-tenant, allow-listed.** Only explicitly allowed identities can sign in. There is no sign-up.
3. **Issued documents are immutable.** An issued invoice or credit note is never edited; corrections happen through void-and-reissue or credit notes. The PDF a client received can be re-downloaded byte-for-byte forever.
4. **Money is exact, tax is structured, numbering is gap-free.** No floating point; tax is stored as typed lines, not a JSON blob; document numbers are allocated at issue inside a transaction.
5. **Every screen is a URL.** No modal-only flows.
6. **Data is always portable.** Everything can be exported as CSV/XLSX/JSON/PDF-bundle, and backup/restore is a documented, tested procedure.

### 1.2 Non-goals (v1)

Multi-user tenancy, online payment collection, recurring invoices, e-invoicing (India IRP / e-way bill), inventory, expenses, time tracking, DOCX output (v1.1), payment reminders (v1.1), mobile app, user-coded templates (templates are parameterised, see 4.17).

---

## 2. Users and roles

| Role | Who | Access |
|---|---|---|
| **Owner** | The person running the instance. Any identity on the allow-list. | Everything. |
| **Viewer** *(v1.1)* | An accountant. | Read-only on invoices, payments, credit notes, clients, exports. No settings. |
| **Public verifier** | Anyone scanning an invoice QR. | The verification page for that one token only. |

---

## 3. Glossary

| Term | Meaning |
|---|---|
| **Issuer profile** | A legal identity the owner bills from: an individual (PAN, optional GSTIN) or a company (CIN, GSTIN). Holds addresses, tax IDs, logo/signature/stamp, base currency, locale, fiscal-year and numbering settings. |
| **Client** | A billed party. Holds billing/shipping address, country and state, tax ID, currency and payment terms. |
| **Service item** | A catalogue entry (name, unit, rate, SAC/HSN, default tax rate) used to pre-fill invoice lines. |
| **Payment method** | A way the client can pay: bank account, UPI, Wise, Revolut, PayPal or custom text. Printed on the invoice. Sensitive fields are encrypted at rest. |
| **Invoice** | The core document. Has a lifecycle (`DRAFT → ISSUED → VOID`), line items, tax lines, payments and credit notes. |
| **Line item** | One billed row: description, SAC/HSN, quantity, unit, rate, tax rate. |
| **Tax line** | Aggregated tax by type and rate (e.g. `CGST 9%`, `SGST 9%`, `IGST 18%`, `VAT 20%`). Derived from line items by the tax engine. |
| **Payment** | A ledger entry against an issued invoice: amount applied, TDS deducted, amount received, FX, fees, receipt. |
| **Credit note** | A numbered, immutable document reducing the amount owed on an issued invoice. |
| **Document** | A rendered artefact (PDF; DOCX in v1.1) stored with its SHA-256 hash. |
| **Verification token** | A random secret printed as a QR on each issued document, resolving to a public verification page. |
| **Document sequence** | The per-issuer, per-kind, per-fiscal-year counter that makes numbering gap-free. |
| **Audit event** | An append-only record of who did what to which entity, when. |
| **Template** | One of the built-in document layouts plus its customisation (colours, fonts, labels, paper…). Chosen in Settings; snapshotted into each document at issue. |
| **Email message** | A record of a document emailed from the app: recipients, subject, body, attached document, delivery status. |

---

## 4. Functional requirements

### 4.1 Authentication and access

- Sign-in via **Google**, **GitHub**, **Keycloak**, **Casdoor** or **any OpenID Connect provider**. A provider appears on the sign-in page only if its credentials are configured.
- **Allow-list.** `AUTH_ALLOWED_EMAILS` is a comma-separated list of exact emails and/or `*@domain` patterns. A sign-in whose verified email is not on the list is rejected *before* a user record is created. If the list is empty the app refuses to start.
- Every allow-listed identity is an **Owner** in v1. Viewer mapping arrives with v1.1.
- Accounts from different providers with the same verified email are linked to one user.
- **Sessions** are server-side and revocable. Settings → Security lists active sessions (device, IP, last seen) with per-session and "sign out everywhere" revocation.
- Sign-in, sign-out and session revocation are audited.
- Each user has personal preferences under Settings → Account: **timezone** (auto-detected from the browser at first sign-in, editable) and theme. "Today" everywhere in the app — default issue date, overdue calculation, dashboard periods — is computed in the signed-in user's timezone.

### 4.2 Issuer profiles

| Group | Fields |
|---|---|
| Identity | type (`INDIVIDUAL` / `COMPANY`), label, legal name, trade name, designation, email, phone, website |
| Address | structured: line 1, line 2, city, state, postal code, country (ISO 3166-1 alpha-2), state code (ISO 3166-2 subdivision), GST state code (2-digit, India) |
| Tax IDs | PAN, GSTIN, CIN, UK VAT number, US EIN/SSN (**encrypted**), LUT number + LUT financial year |
| Defaults | base currency, locale (`en-IN`, `en-GB`, `en-US`, …) for document formatting, fiscal-year start month, invoice number format, credit-note number format, default tax regime, default expected TDS rate, default display config, default notes, default terms |
| Email | default CC/BCC; subject and body templates for invoices and credit notes — see 4.16 |
| Template | optional override of the instance-wide document template — see 4.17 |
| Assets | logo, signature (transparent PNG), stamp (transparent PNG) |

Rules:
- At least one profile must exist before an invoice can be created; the first profile created becomes default. Exactly one non-archived profile is default at any time.
- A profile with issued invoices cannot be deleted, only **archived** (hidden from pickers; existing documents unaffected).
- Number formats use tokens `{FY}` (e.g. `26-27`), `{FYYYY}` (`2026-27`), `{YYYY}`, `{YY}`, `{MM}`, `{SEQ}`, `{SEQ:n}` (zero-padded to *n*). Default `INV/{FY}/{SEQ:3}` and `CN/{FY}/{SEQ:3}`. Changing a format affects only future numbers.

### 4.3 Clients

Fields: display name (organisation or person), contact person, email, phone, billing address, optional shipping address, country, state code and GST state code (required when the issuer is India-GST-registered and the client is in India), tax ID and its type (`GSTIN` / `VAT` / `EIN` / `OTHER`), currency, payment terms (days), default expected TDS rate, notes.

Rules: archive, never delete, once referenced by an invoice. Client profile page shows lifetime billed, received, outstanding (per currency) and invoice history.

### 4.4 Service catalogue

Fields: name, description, unit type (`HOUR`, `DAY`, `FIXED`, `MILESTONE`, `UNIT`), default rate, currency, SAC/HSN code, default tax rate, active flag. Selecting a service on an invoice **copies** its values into the line; later edits to the service do not touch existing invoices.

### 4.5 Payment methods

Types and their structured details:

| Type | Details (encrypted at rest) |
|---|---|
| `BANK_TRANSFER` | account holder, account number, bank name, branch, IFSC, SWIFT/BIC, IBAN, routing/sort code (any subset) |
| `UPI` | VPA, optional payee name |
| `WISE` / `REVOLUT` / `PAYPAL` | account email/handle plus any of the bank fields above |
| `CUSTOM` | free-text lines |

Each has a name, optional currency, active flag, display instructions and an optional default flag. An invoice picks one or more methods and the order in which they print. At issue time their details are **snapshotted** into the invoice so later edits never alter an issued document.

### 4.6 Invoices

**Builder.** Split-screen: form on the left, live preview (same renderer as the PDF) on the right. Steps: issuer → client (pre-fills currency, regime, terms, TDS) → line items (from catalogue or ad hoc, reorderable) → discount → tax settings → expected TDS → payment methods → display config → PO reference, notes, terms.

**Lifecycle.**

```
DRAFT ──issue──▶ ISSUED ──void──▶ VOID
  │                 │
  └─delete          └─void & reissue ──▶ new DRAFT (linked, "replaces INV/…")
```

- `DRAFT`: fully editable; no number; can be deleted.
- `ISSUED`: number allocated, snapshots taken, PDF rendered and stored, everything frozen. Only these may change afterwards: `sentAt`, payments, credit notes, void.
- `VOID`: requires a reason. Allowed only if no payments are recorded; otherwise use a credit note. A voided number is never reused (voided invoices remain in the register — this is what keeps the sequence gap-free and auditable).
- **Void & reissue** voids the original and creates a new draft with the same content, linked both ways. The new invoice prints "Replaces INV/…" if the display config allows.

**Derived display status** (never stored), first match wins: `DRAFT`, `VOID`, `PAID` (balance ≤ 0), `OVERDUE` (balance > 0 and the due date has passed — a partial payment does not hide a late balance), `PARTIALLY_PAID` (some payment, balance > 0), `SENT` (`sentAt` set), otherwise `ISSUED`. "Mark as sent" sets `sentAt` manually in v1.

**Numbering.** Allocated **at issue**, per issuer, per document kind, per fiscal year, strictly consecutive. Drafts never consume numbers. Issue and allocation happen in one transaction; a failed issue leaves no gap.

**Dates.** Issue date defaults to today in the signed-in user's timezone; due date defaults to issue date + client payment terms. Both are calendar dates (no time component).

**Amounts.** Line and total amounts are rounded half-up to the currency's **minor units** — 2 for INR/USD/GBP/EUR, 0 for JPY/KRW — derived from `Intl`. The seven three-decimal currencies (BHD, IQD, JOD, KWD, LYD, OMR, TND) are rejected at validation in v1. Quantities allow three decimals.

```
round(x)          = half-up to the invoice currency's minor units
lineSubtotal      = round(quantity × unitPrice)
subtotal          = Σ lineSubtotal
discountAmount    = fixed amount, or round(subtotal × pct)
taxableAmount     = subtotal − discountAmount
                    (discount is apportioned across lines pro-rata for per-line tax)
taxAmount         = Σ taxLines.amount        (see 4.7)
roundingAdjustment= optional, to round total to a whole currency unit (Indian practice); |adj| < 1
total             = taxableAmount + taxAmount + roundingAdjustment
tdsExpected       = round(taxableAmount × tdsRate)      (informational)
netExpected       = total − tdsExpected                  (informational)
balanceDue        = total − Σ payments.amountApplied − Σ creditNotes.total (non-void)
```

**Multi-currency.** Each invoice has one currency. `fxRateToBase` (invoice currency → issuer base currency) is captured at issue for reporting; it can be entered manually (no live FX lookups in v1).

**Display config.** Per-invoice set of booleans controlling which issuer fields, client fields, columns and sections print (see v1 plan §6 for the field list, which is retained). Defaults come from the issuer profile. Applies identically to the live preview and the PDF.

**Documents.** On issue the PDF is rendered, stored and hashed. Downloads always serve the stored file. If a rendering defect is later fixed, a *new document version* may be generated on demand; earlier versions are retained and the verification page lists all hashes. The template configuration in force (4.17) is snapshotted with the document at issue, so later template changes never alter an issued document; regenerated versions render from the snapshot.

**Documents fit A4 and Letter.** The items table repeats its header row on every page, the totals block (subtotal to amount in words) never splits across pages, section titles are never left alone at a page foot, and a footer band carrying the document number and "Page n of N" is reserved on every page. The builder's live preview shows the whole sheet and an approximate printed page count.

**Protected copies.** A password-protected copy of an issued document is a separate stored version (`PDF_PROTECTED`, its own version sequence, suffix `-protected`) rendered from the same snapshot and AES-256 encrypted: it opens with the recipient's password, can be read, printed at full quality and read aloud, and cannot have text copied, be edited, annotated, form-filled or re-assembled (those need the owner password, generated per copy and never shown). The passphrase is six EFF-short-list words joined with hyphens, or a manual password with a strength hint. Every copy is audited (`document.protected`, never with the passwords); the canonical PDF's bytes and hash are unaffected, and the verification page lists protected copies separately.

**Share links.** An editor can share an issued (or voided) invoice or credit note by a public link `/i/<token>` (32 random bytes; stored hashed for lookup and encrypted so the owner can copy it again), optionally behind a password: a generated six-word passphrase or the owner's own. A password-protected link renders its own password-protected copy (above) when created and only ever serves that copy; the canonical PDF is never reachable through it. The viewer page shows document facts (issuer, client, number, date, total, void status), the same HTML preview the app uses, and a download; it never shows payment status. A right password sets an hour-long cookie scoped to that link; guesses are limited to five per link and address per quarter hour, and unknown, revoked and expired links all answer the same way. Links can expire in 7, 30 or 90 days or never, are revoked at any time, and count views and downloads. Creation and revocation are audited; tokens and passwords never reach the audit log.

**Draft preview.** A draft can be previewed as a PDF at any time; it carries a diagonal "DRAFT — not a tax invoice" watermark, no number and no QR, and is never stored.

**QR code.** Encodes `https://<host>/verify/<token>`. Optional per display config. The token is rotated at issue, so a QR from a draft preview never resolves.

### 4.7 Taxes

Regimes: `INDIA_GST`, `UK_VAT`, `US_SALES_TAX`, `NONE`. The regime is chosen per invoice (default from issuer); the tax engine turns line items into tax lines.

**India GST**

| Situation | Determination | Tax lines | Printed statement |
|---|---|---|---|
| Client in India, same GST state code as issuer | `INTRA_STATE` | `CGST r/2` + `SGST r/2` per rate | — |
| Client in India, different state | `INTER_STATE` | `IGST r` per rate | — |
| Client outside India, issuer has valid LUT for the FY | `EXPORT_LUT` | none (0%) | "Supply meant for export under LUT without payment of IGST" |
| Client outside India, no LUT | `EXPORT_WITH_TAX` | `IGST r` | "Supply meant for export on payment of IGST" |
| Reverse charge flagged | `REVERSE_CHARGE` | none on the invoice | "Tax payable on reverse charge basis" |
| Issuer has no GSTIN | `NOT_APPLICABLE` | none | optional "Not registered under GST" |

- Line tax rates selectable from `0, 5, 12, 18, 28` (default from service). SAC/HSN is required on every line when GST applies. Place of supply (state name + code) prints in the header.
- Amount in words prints in Indian numbering ("Rupees Twelve Lakh Thirty-Four Thousand Only").
- **Rounding (decided).** Tax is computed per line and per component (CGST and SGST separately), each rounded half-up to minor units, then aggregated into tax lines; totals are sums of the rounded parts, so the printed table always foots. Whole-rupee presentation is done with the rounding-adjustment line, never by re-rounding tax. This mirrors mainstream Indian accounting packages and keeps rate-wise summaries within the ±1 tolerance used by e-invoice validation.

**UK VAT.** Per-line rate from `20, 5, 0` or exempt; issuer VAT number prints; optional "Reverse charge: customer to account for VAT" statement for B2B supplies outside the UK.

**US sales tax.** A single manually entered rate per invoice (or per line). No jurisdiction lookup.

**None.** No tax lines. A free-text tax note may still be printed.

**TDS (India).** The invoice may show an *expected* TDS rate and amount (e.g. 10% under §194J) so the client knows the net to remit. The *actual* TDS is recorded per payment (4.8) and reported separately for Form 26AS reconciliation.

### 4.8 Payments

A payment records: date, kind (`PAYMENT`, `REFUND`, `WRITE_OFF`), **amount applied** (in invoice currency; negative for refunds), TDS deducted (part of the applied amount), amount received + currency + exchange rate (what actually landed in the bank), bank fees, receiving payment method, reference, notes, receipt upload.

Rules:
- Only `ISSUED` invoices accept payments.
- Cumulative applied amount may not exceed the outstanding balance except through an explicit `WRITE_OFF` (which itself is capped at the outstanding balance).
- Recording, editing or deleting a payment recomputes the invoice balance in the same transaction and is audited.
- The invoice's payments page is a ledger: running balance, totals by kind, TDS total.

### 4.8a Products and SKUs

Besides services, the catalogue holds **products**: goods with a unique SKU (letters, digits,
`. _ / -`, up to 40 characters), a name, description, unit (default UNIT), unit price, currency,
HSN code and default tax rate; active/inactive and archivable like services. Picking a product in
the builder copies its values onto the line and snapshots the SKU on the invoice line
(`InvoiceItem.sku`), so the printed document keeps it even after the product changes or is
archived. The SKU prints under the line description when the display config's `showSku` is on
(default on). Exports: a `products` dataset and a `SKU` column on `invoice-items`; `data.json`
includes `products`. A product referenced by an invoice line cannot be deleted, only archived.

**Profile tags.** A service or product may be tagged to one or more issuer profiles. An item with
no tags is offered to every profile; a tagged item only to the profiles it names. The builder's
catalogue picker shows only items offered to the selected issuer and re-filters when the issuer
changes. Tags never affect lines already on a document.

### 4.9 Credit notes

- Issued **against one issued invoice**. Own gap-free sequence (`CN/{FY}/{SEQ:3}`). Same lifecycle as invoices (`DRAFT → ISSUED → VOID`), same immutability, own PDF and verification token.
- **Amount-based (decided — no line items in v1).** A credit note has a reason and a credit amount *excluding* tax. Tax is apportioned pro-rata across the invoice's tax lines by taxable amount (largest-remainder, so the parts sum exactly), producing the credit note's own tax lines and total. A picker lets the user tick invoice lines (whole, or a percentage) to *compute* the amount; it only fills the amount field.
- The credit amount may not exceed the invoice's outstanding taxable balance, and the total may not exceed the outstanding balance, at issue time.
- An issued credit note reduces the invoice balance; a voided one restores it.

### 4.10 Documents and rendering

- Look and feel come from the active document template and its customisation (4.17), chosen in Settings — never on the invoice form. Three built-ins ship in v1.
- Fonts embedded; must include `₹`, `£`, `€` and Devanagari-free Latin coverage. Logo/signature/stamp embedded at print resolution.
- **Script fonts (v1.1).** Text in a non-Latin script prints from the matching Noto Sans family (Devanagari, Bengali, Gurmukhi, Gujarati, Oriya, Tamil, Telugu, Kannada, Malayalam, Sinhala, Thai, Lao, Myanmar, Khmer, Arabic, Hebrew, Syriac, Georgian, Armenian, Ethiopic, Greek, Cyrillic; Han, kana and hangul from Noto Sans SC/TC/JP/KR chosen by the document language), run by run, so a Latin template font and a Hindi client name share a line. Limitations: CJK prints in the regular weight only; the amount in words stays English; right-to-left languages right-align the text columns and mirror the items table, but mixed-direction lines are laid out in logical order.
- Locale-aware formatting from the issuer profile: number grouping (`12,34,567.00` for `en-IN`), date format, currency display (`₹` / `INR` per config).
- **Document language (v1.1).** Every invoice and credit note carries a `documentLocale` (one of the UI languages). Its fixed strings (labels, title, page footer, verification caption, watermarks) print from that language's catalogue, template label overrides still winning; dates and amounts format in that language, except that an issuer whose own locale is a regional variant of it keeps that variant (an `en-IN` issuer printing in English keeps lakh grouping). The builder defaults the language from the client's preferred document language, else the issuer profile's locale, else `en-US`; a credit note copies its invoice's language. Like everything else on an issued document it never changes afterwards.
- File naming: `INV-26-27-001.pdf`, `CN-26-27-002.pdf`.
- **DOCX copies (v1.1).** Every issued or voided document can also be downloaded as a `.docx` rendered from the same view-model and template snapshot (page size and margins, header band, parties, an items table whose header row repeats on every page, totals, words, payment details, notes, terms, QR and signature block, footer with the number and page numbers). It is stored as its own `Document` version (`format DOCX`, own hash and filename) on first demand, never changes afterwards, can be attached to the e-mail composer instead of the PDF, and can be included in the documents ZIP. The DOCX is a convenience copy: the PDF stays the canonical, verifiable document.

### 4.11 Exports (CSV and XLSX)

Every index page has an **Export** control (format + the page's current filters). All exports are owner-only, audited and rate-limited.

| Dataset | Filters | Columns |
|---|---|---|
| **Invoices register** | FY or date range, issuer, client, status, currency | number, status, issue date, due date, issuer, client, client tax ID, place of supply, supply type, currency, subtotal, discount, taxable, CGST, SGST, IGST, VAT, other tax, rounding, total, TDS expected, paid, credited, balance, FX rate, base-currency total, PO ref, sent at, void reason |
| **Invoice line items** | same as register | invoice number, issue date, client, position, description, SAC/HSN, unit, qty, rate, line subtotal, tax rate, tax amount, line total |
| **Payments ledger** | date range, issuer, client, method | date, kind, invoice number, client, currency, amount applied, TDS deducted, received amount, received currency, FX rate, bank fees, method, reference, notes |
| **Credit notes register** | FY or date range, issuer, client, status | number, status, issue date, against invoice, client, currency, subtotal, tax, total, reason |
| **Clients** | active/archived | all client fields |
| **Services** | active/archived | all service fields |
| **GST summary** | FY or date range, issuer | one row per invoice per tax rate: invoice number, date, client GSTIN, place of supply, supply type, rate, taxable, CGST, SGST, IGST, total — laid out to map onto GSTR-1 B2B / export tables |
| **TDS summary** | FY, issuer | one row per client: client, PAN/tax ID, invoices count, taxable billed, TDS expected, TDS actually deducted (from payments) |

Format rules:
- **CSV**: UTF-8 with BOM (so Excel opens it correctly), `\r\n`, RFC 4180 quoting, ISO dates, plain decimal numbers with `.` separator and no grouping.
- **XLSX**: typed cells (numbers as numbers with `#,##0.00` format, dates as dates), bold frozen header row, autofilter, column widths, a second sheet named `Filters` recording what was exported and when.
- **Formula-injection guard**: any text cell beginning with `=`, `+`, `-`, `@`, `\t` or `\r` is prefixed with `'` in CSV and written as an explicit string cell in XLSX.
- File names: `okinvo-<dataset>-<from>_<to>.<ext>`.

**Settings → Data** additionally offers:
- **Export all data**: a ZIP containing every dataset above as CSV *and* a `data.json` with the full relational snapshot (for migration / re-import later).
- **Export documents**: a ZIP of all issued invoice and credit-note PDFs for a chosen FY or date range, named by number — the accountant hand-off.

### 4.12 Verification page (`/verify/[token]`)

Public, no sign-in, rate-limited, `noindex`.

Shows only: document kind and number, issuer legal name (and GSTIN if the document printed it), client display name, issue date, currency and total, and whether the document is **valid** or **void** (never payment status). Lists the SHA-256 of every stored PDF version and offers a *"check your copy"* control that hashes a user-selected file in the browser and compares — nothing is uploaded.

Unknown or malformed tokens return a generic "no such document" page with identical timing to a valid lookup. Only issued or voided documents resolve; drafts never do.

### 4.13 Settings

| Page | Contents |
|---|---|
| Profiles | list / create / edit / archive issuer profiles; set default; per-profile email templates and optional template override |
| Payment methods | list / create / edit / archive; set default; reorder |
| Templates | choose the active document template; customise it with a live preview; reset; export/import config — see 4.17 |
| Email | SMTP settings (or "configured by environment" status); send test email; default CC/BCC; sent-mail log — see 4.16 |
| Security | active sessions with revoke; audit log viewer (filter by entity, action, date) |
| Data | export all data; export documents; backup instructions and last-backup indicator |
| Account | display name; timezone (auto-detected, editable); theme: system / light / dark |

### 4.14 Dashboard (`/`)

Outstanding and overdue (count + amount, per currency), billed and received this fiscal year (base currency, using recorded FX rates), drafts awaiting issue, ten most recent invoices, top clients by outstanding.

### 4.15 Audit log

Append-only. Every create/update/archive of clients, services, profiles and payment methods; every invoice and credit-note issue/void/mark-sent; every payment change; every export; every email send; every sign-in/out and session revocation; every settings change (including template and SMTP changes). Each event stores actor, action, entity, a before/after diff (encrypted fields redacted), IP, user agent and timestamp.

### 4.16 Email

**Configuration.** SMTP can be supplied through the environment (`SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURITY`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`, `SMTP_FROM_NAME`, `SMTP_REPLY_TO`) **or** entered in Settings → Email (password encrypted at rest). Settings take precedence over the environment; the page says which source is active. A **Send test email** button verifies the connection by delivering a message to the signed-in user. When neither is configured, email features fall back to the mail-app flow below.

**Sending a document.** An issued invoice or credit note has a **Send by email** action that opens a composer (its own page) pre-filled from the issuer profile's email templates:
- To: the client's email. CC/BCC: the instance and issuer defaults. All editable.
- Subject and body rendered from the templates with placeholders — `{{number}}`, `{{issuerName}}`, `{{clientName}}`, `{{contactPerson}}`, `{{issueDate}}`, `{{dueDate}}`, `{{total}}`, `{{balanceDue}}`, `{{currency}}`, `{{paymentTerms}}`, `{{verifyUrl}}` — and freely editable before sending.
- Attachment: the stored PDF for that document. Always attached; cannot be swapped for an arbitrary file.
- **Nothing is sent until the user clicks Send.** Every attempt creates an email-message record (recipients, subject, body, attached document, provider message id, status `SENT` or `FAILED` with the error) shown on the document's history page and in Settings → Email. The first successful send sets the document's `sentAt`. Sends are audited and rate-limited (30 per hour).

**Without SMTP.** The same composer shows **Open in mail app** instead of Send: it opens a `mailto:` link carrying the subject and body, downloads the PDF for manual attachment, and offers **Mark as sent**, which sets `sentAt` and records a `MANUAL` email-message entry.

**Content rules.** Templates are plain text. The outgoing message has a text part and a minimal HTML part generated from it (escaped, paragraphs and links only, no remote images, no tracking). Payment reminders reuse this composer with a reminder template in v1.1.

### 4.17 Document templates

**The choice lives in Settings → Templates, never on the invoice form.** Six built-in templates ship (three from v1, three added in v1.1):

| Template | Character |
|---|---|
| `ledger` | Modern and airy, Linear-like; sans-serif; accent rule under the header |
| `classic` | Traditional bordered table, serif headings, boxed totals |
| `compact` | Dense layout for long item lists; smaller type, fewer separators |
| `minimal` | Quiet and spacious; no rules or boxes, light labels, plenty of air |
| `letterhead` | Logo and name on a full-width colour band or image at the top of every page |
| `modern` | Colour band header; parties, table header and totals on a pale accent tint |

**Customisation** (the "template config"), edited with a live preview on sample data and applied to invoices and credit notes alike:
- Paper size (A4 / Letter) and margins preset (normal / narrow).
- Accent colour, text colour, table style (ruled / zebra / plain).
- Heading font and body font, each from a fixed catalogue of 100 Google families (50 sans, 50 serif) vendored into the app; v1 configs that stored a single pairing string are read as the equivalent pair.
- Logo position (left / right / centre) and height.
- Header: none, a colour band, or an uploaded image (PNG/JPEG/WebP, stored as PNG no wider than 2400 px) with an opacity (0–1) and height (20–60 mm); the band or image repeats on every page and carries the logo, name, title and number. Text on the band is light or dark automatically from the band colour (images default to dark) or as chosen. `letterhead` and `modern` show a band when the style is "none".
- Document title (`TAX INVOICE`, `INVOICE`, `BILL OF SUPPLY`, or custom text) with a GST-appropriate automatic default.
- Label overrides for the fixed strings (e.g. "Bill to", "Amount due", "Payment details"), length-limited.
- Which totals rows print (subtotal, discount, per-tax-line, TDS expected, rounding) and where "amount in words" sits (below totals / footer / hidden).
- Header note, footer text, signature caption, page numbers, QR position, draft watermark text.
- Reset to defaults; export and import the config as JSON.

**Boundaries.** Templates are parameterised, not user-coded: no custom HTML/CSS and no uploaded fonts in v1. Field *visibility* remains the per-invoice display config (4.6) with defaults from the issuer profile — the template decides how things look, the display config decides what appears.

**Scope and immutability.** One active config applies instance-wide; an issuer profile may opt into its own override ("use a different template for this profile"). The effective config is snapshotted into each document at issue; later changes affect only future documents.

---

### 4.18 API keys

A signed-in user can create **API keys** (Settings → API): `okv_` + 43 random base64url characters, shown once, stored as a SHA-256 hash with a display prefix, a name, a chosen subset of scopes (`invoices:read`, `invoices:create`, `credit_notes:read`, `credit_notes:create`, `catalogue:read`, `documents:read`, `status:read`) and an optional expiry (30, 90 or 365 days). The user's role is a ceiling at creation and at every use: viewers may hold read scopes only; the effective scopes of a key are the stored set intersected with the role the user has now, so demoting a user narrows their keys at once. A key is sent as `Authorization: Bearer okv_…`; it is refused when revoked, expired, or when its user is deactivated or no longer admitted, and it is rate-limited to 120 requests per minute. Keys can be revoked by their owner or by any owner; deactivating a user revokes all of theirs. Creation and revocation are audited, and audit entries written through a key name it. The 15-minute JWT from `/api/auth/token` keeps working with the scopes of the user's role.

### 4.19 REST API v1

`/api/v1/*` is the versioned, documented surface for scripts, the SDK and the MCP server. It authenticates with an API key (4.18), the 15-minute JWT, or the browser session, and every route names the scope it needs. Responses are enveloped: `{ data }` for one record, `{ data: [...], nextCursor }` for lists (cursor = the last id sent, `limit` 1–100, default 50), `{ error: { code, message, issues? } }` with a stable code (`unauthenticated`, `insufficient_scope`, `forbidden`, `not_found`, `validation`, `bad_charset`, `conflict`, `invariant`, `rate_limited`, `method_not_allowed`) on failure. Bodies are JSON, at most 1 MB, charset-checked, Zod-validated. Routes: invoices (list with the register filters, get, create a draft — display config defaults from the profile — issue, pdf, docx), credit notes (list, get, create a draft against an issued invoice, issue, pdf, docx), clients, profiles (without personal tax ids, mail defaults, template config or asset keys), services and products (optionally only those offered to an issuer), payment methods (names and types only, never details), status. There is no delete or update: `DELETE`, `PUT` and `PATCH` under `/api/v1` and `/api/mcp` answer 405 with an `Allow` header before any handler runs, and corrections go through the same void / re-issue / credit-note paths as the UI. Bearer requests are not cookie-authenticated, so the CSRF origin check does not apply to them. The API is described by an OpenAPI 3.1 document generated from the same Zod schemas (`/api/openapi.json` on every instance; `openapi/okinvo.json` committed) and consumed by a generated TypeScript SDK under `sdk/`; CI fails when either is stale. The MCP server at `POST /api/mcp` (Streamable HTTP, stateless, JSON responses; `GET`/`DELETE` 405) is built per request for the API key's effective scopes: tools `list_invoices`, `get_invoice`, `create_invoice`, `issue_invoice`, `list_credit_notes`, `get_credit_note`, `create_credit_note`, `issue_credit_note`, `list_clients`, `list_profiles`, `list_catalogue`, `get_status` appear only when their scope is held, resources `okinvo://invoices/{id}/pdf` and `okinvo://credit-notes/{id}/pdf` (base64 PDF) need `documents:read`, tool inputs are the REST bodies and outputs the REST DTOs, failures are in-band tool errors carrying the REST error codes, and no delete, void, payment or settings tool exists for any key. The `skills/okinvo-invoicing` skill documents the workflow for agents.

### 4.20 e-Invoicing (India)

- Every issued invoice under India GST whose issuer profile has e-invoicing enabled and a GSTIN offers the GST e-invoice JSON (INV-01 v1.1) for download, built from the issue-time snapshots: supply type, parties with the structured address frozen at issue, items with HSN and UQC units, the discount apportioned over the lines, CGST/SGST or IGST, totals that reconcile with the invoice (TDS is never subtracted), export details under LUT. Documents issued before the structured address was snapshotted cannot be registered until reissued.
- **IRN registration** goes through the connector chosen per profile under Settings > E-invoicing: `manual` (the owner registers the JSON on the portal or through a GSP and pastes the response: Irn, AckNo, AckDt, SignedQRCode) or `nic` (the NIC IRP API, sandbox or production, GSP credentials and the IRP public key stored encrypted; implemented against the published protocol and recorded fixtures only, unverified against a live sandbox until credentials are supplied).
- The registration state lives on the invoice (`einvoice`: NONE, REGISTERED, CANCELLED, FAILED with IRN, acknowledgement, signed QR and signed invoice). It is the one field of an issued invoice that changes after issue besides sending, voiding and payments; every change is audited and the stored PDF is regenerated as a new version so the archive carries the IRN.
- A registered document prints the IRN, the acknowledgement number and date, and the portal's signed QR in place of the okinvo verification QR; a cancelled registration prints an "E-INVOICE CANCELLED" stamp. Cancellation is allowed within 24 hours of the acknowledgement with the portal's reason codes (duplicate, data entry mistake, order cancelled, others); a cancelled IRN is never registered again, the invoice is voided and reissued instead.
- The invoice register filters by registration (registered, not registered, cancelled) and shows it beside the status.
- **EN 16931 outputs (EU and UK).** When the issuer profile's EU profile under Settings > E-invoicing is EN 16931, every issued invoice and credit note also offers the UN/CEFACT CII XML (the Factur-X EN16931 profile) and the Peppol BIS Billing 3.0 UBL 2.1 XML (`Invoice` / `CreditNote`) for download. Both are built from the same snapshots: Rec 20 unit codes (HUR, DAY, C62), UNCL 5305 categories (S, Z, E, AE with the VATEX reverse-charge reason, G for exports under LUT, O without a regime), the party electronic addresses with their EAS scheme, the bank account as payment means (58 with an IBAN, else 30), the invoice-level discount as an allowance spread over the lines, and a VAT breakdown per category and rate whose amounts equal the invoice totals. A credit note becomes one line per taxable amount described by its reason and references the invoice it corrects. The same profiles also offer a **Factur-X** copy: the canonical PDF assembled as PDF/A-3b (sRGB output intent, XMP with the Factur-X extension schema, embedded `factur-x.xml` as an Alternative associated file), stored as its own `PDF_A3` document version, validated with veraPDF in the integration tests, and available on the pages, through `/api/v1/.../facturx` and as an option of the documents ZIP. Download only: nothing is sent to an access point.

## 5. Route map

```
/                                  dashboard
/invoices                          register (filters, export)
/invoices/new                      builder
/invoices/[id]                     overview, actions, downloads
/invoices/[id]/edit                builder (DRAFT only; ISSUED redirects to overview)
/invoices/[id]/payments            ledger
/invoices/[id]/history             audit events, emails sent, reissue chain
/invoices/[id]/send                email composer (draft, edit, send)
/credit-notes                      register
/credit-notes/new?invoice=[id]     builder
/credit-notes/[id]                 overview, downloads
/credit-notes/[id]/send            email composer
/clients                           directory
/clients/new · /clients/[id] · /clients/[id]/edit
/services                          catalogue
/services/new · /services/[id]/edit
/verify/[token]                    public verification
/auth/sign-in · /auth/error
/settings/profiles · /settings/profiles/new · /settings/profiles/[id]/edit
/settings/payment-methods
/settings/templates                choose and customise the document template
/settings/email                    SMTP, defaults, sent-mail log
/settings/security
/settings/data
/settings/account                  timezone, theme
```

Machine endpoints: `/api/auth/*`, `/api/uploads`, `/api/assets/[...key]` (authenticated streaming), `/api/documents/[id]` (authenticated download), `/api/documents/preview` (watermarked draft / template sample), `/api/exports/[dataset]`, `/api/health/live`, `/api/health/ready`.

---

## 6. Non-functional requirements

| Area | Requirement |
|---|---|
| Deployment | Docker Compose (primary) and Kubernetes (Kustomize overlay), both fully self-contained: app, Postgres, blob storage, reverse proxy, backups. No managed cloud services. |
| Scale | One owner; thousands of invoices; single app replica by default. Multi-replica is supported only with the S3 storage driver and the database-backed rate limiter. |
| Performance | Builder preview updates < 100 ms; issue (including PDF render) < 3 s; exports stream (no in-memory buffering of whole datasets). |
| Backups | Nightly automated Postgres dump + blob-store snapshot to a local backup volume with retention; documented and tested restore. |
| Security | Allow-listed SSO, server-side sessions, authorization in the data-access layer, encrypted sensitive fields, private blob storage served through the app, strict CSP, rate limits on auth/verify/upload/export, non-root containers, secrets only via environment, audit log. |
| Accessibility | Keyboard-operable builder; WCAG 2.1 AA colour contrast in every shipped theme; form errors announced. |
| Design | The UI follows `DESIGN.md` (Linear-derived: near-black canvas, four-step surface ladder, single lavender accent used scarcely, 8px radius, hairline borders). Dark, inverse-light and system modes all ship in v1 with AA-verified palettes (see `IMPLEMENTATION_PLAN_v2.md` §24.5). Amounts, document numbers and dates render in the mono face. PDFs are always light. |
| Browsers | Latest two versions of Chrome, Firefox, Safari, Edge. Desktop-first; register and overview pages usable on a phone. |
| Localisation | English UI. Locale-aware number/date/currency formatting per issuer profile. |
| Time | Server stores UTC instants for events and plain calendar dates for document dates; "today" is computed in the signed-in user's timezone. |

---

### 6.6 Input charset

Every text field accepts only the characters on a standard keyboard:

```
abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789`~!@#$%^&*()_-+=}]{["':;?/>.<,
```

plus space, tab and newline. Backslash and the pipe are not on the list. The shared text inputs drop anything else as it is typed or pasted, and every server boundary (server actions through `parseForm`/`parseObject`, route handlers, the sign-up display name) rejects a value containing any other character with the message "Only standard keyboard characters are allowed." — before a schema or the database sees it. Passwords and other credentials are exempt: they are hashed or encrypted and never rendered. Nothing typed into the app is ever interpreted: every database access goes through Prisma's parameterised queries (the only raw statement is the health check's constant `SELECT 1`), nothing shells out, and exported cells still pass the formula-injection guard.

## 7. Release phases

| Phase | Scope |
|---|---|
| **v1.0** | Everything in §4 except items marked v1.1. |
| **v1.1** | Viewer role; DOCX export; payment reminders through the email composer; import from the `data.json` export. |
| **v2** | Recurring invoices; additional templates; multiple owners per instance (workspaces); optional e-invoicing hooks. |
