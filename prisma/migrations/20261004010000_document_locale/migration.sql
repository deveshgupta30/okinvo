-- Per-document language (SPEC §4.10): invoices and credit notes print in their own language,
-- clients may prefer one. Existing documents keep printing in English, formatted with their
-- issuer's locale as before (see formattingLocale).
ALTER TABLE "Invoice" ADD COLUMN "documentLocale" TEXT NOT NULL DEFAULT 'en-US';
ALTER TABLE "CreditNote" ADD COLUMN "documentLocale" TEXT NOT NULL DEFAULT 'en-US';
ALTER TABLE "Client" ADD COLUMN "preferredLocale" TEXT;
