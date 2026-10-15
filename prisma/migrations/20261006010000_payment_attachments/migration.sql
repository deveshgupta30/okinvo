-- Payment receipts (addendum §4): several attachments per payment replace the single
-- receiptAssetId; existing receipts move across before the column goes.
CREATE TABLE "PaymentAttachment" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentAttachment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PaymentAttachment_paymentId_assetId_key" ON "PaymentAttachment"("paymentId", "assetId");
CREATE INDEX "PaymentAttachment_paymentId_idx" ON "PaymentAttachment"("paymentId");

ALTER TABLE "PaymentAttachment" ADD CONSTRAINT "PaymentAttachment_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PaymentAttachment" ADD CONSTRAINT "PaymentAttachment_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "PaymentAttachment" ("id", "paymentId", "assetId", "position", "createdAt")
SELECT gen_random_uuid()::text, "id", "receiptAssetId", 0, "createdAt"
FROM "Payment"
WHERE "receiptAssetId" IS NOT NULL;

DROP INDEX IF EXISTS "Payment_receiptAssetId_key";
ALTER TABLE "Payment" DROP COLUMN "receiptAssetId";
