-- Credit notes share the invoice lifecycle (SPEC §4.9); the composer sets sentAt on first send.
ALTER TABLE "CreditNote" ADD COLUMN "sentAt" TIMESTAMP(3);
