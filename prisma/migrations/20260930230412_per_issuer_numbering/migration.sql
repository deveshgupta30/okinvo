-- Document numbers are unique per issuer profile (SPEC §4.6), not globally.
DROP INDEX "Invoice_number_key";
CREATE UNIQUE INDEX "Invoice_issuerProfileId_number_key" ON "Invoice"("issuerProfileId", "number");

DROP INDEX "CreditNote_number_key";
CREATE UNIQUE INDEX "CreditNote_issuerProfileId_number_key" ON "CreditNote"("issuerProfileId", "number");
