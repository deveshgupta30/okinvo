-- E-invoicing (spec §9e): Peppol identifiers on clients and issuer profiles, the per-profile
-- switch, and the registration state kept on each document.
ALTER TABLE "Client" ADD COLUMN "buyerReference" TEXT;
ALTER TABLE "Client" ADD COLUMN "electronicAddress" TEXT;
ALTER TABLE "Client" ADD COLUMN "electronicAddressScheme" TEXT;
ALTER TABLE "IssuerProfile" ADD COLUMN "electronicAddress" TEXT;
ALTER TABLE "IssuerProfile" ADD COLUMN "electronicAddressScheme" TEXT;
ALTER TABLE "IssuerProfile" ADD COLUMN "einvoiceEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Invoice" ADD COLUMN "einvoice" JSONB;
ALTER TABLE "CreditNote" ADD COLUMN "einvoice" JSONB;
