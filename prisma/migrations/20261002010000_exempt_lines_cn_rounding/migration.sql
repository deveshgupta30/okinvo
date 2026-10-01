-- UK VAT exempt supplies (SPEC §4.7) and the rounding a final credit note absorbs so a rounded
-- invoice can be credited in full (review follow-ups).
ALTER TABLE "InvoiceItem" ADD COLUMN "taxExempt" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CreditNote" ADD COLUMN "roundingAdjustment" DECIMAL(14,2) NOT NULL DEFAULT 0;
