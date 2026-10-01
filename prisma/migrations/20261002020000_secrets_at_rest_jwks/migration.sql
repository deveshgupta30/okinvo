-- Secrets at rest (review follow-ups):
--  * verification tokens are stored as their SHA-256 hash; the plaintext is kept encrypted in a
--    sibling column so the app can still rebuild verify links and QR codes;
--  * the payment-method snapshot an issued invoice prints (bank details) is encrypted with the
--    field key instead of sitting in a JSON column;
--  * the "jwks" table holds the JWT plugin's signing keys (private keys encrypted by Better Auth).

ALTER TABLE "Invoice" ADD COLUMN "verificationTokenEnc" TEXT;
ALTER TABLE "CreditNote" ADD COLUMN "verificationTokenEnc" TEXT;

-- Existing rows: hash the plaintext token in place. Their encrypted copy stays NULL, so the app
-- cannot rebuild their verify links (QR codes already printed keep working through the hash);
-- void-and-reissue creates a fresh token.
UPDATE "Invoice"
SET "verificationToken" = encode(sha256(convert_to("verificationToken", 'UTF8')), 'hex');
UPDATE "CreditNote"
SET "verificationToken" = encode(sha256(convert_to("verificationToken", 'UTF8')), 'hex');

ALTER TABLE "Invoice" ADD COLUMN "paymentMethodsSnapshotEnc" TEXT;
-- The plaintext snapshot cannot be encrypted in SQL (the key lives in the app); it is dropped.
-- Stored PDFs are unaffected; a regenerated PDF for a pre-existing invoice prints no payment
-- methods.
ALTER TABLE "Invoice" DROP COLUMN "paymentMethodsSnapshot";

CREATE TABLE "jwks" (
    "id" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    "privateKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "alg" TEXT,
    "crv" TEXT,

    CONSTRAINT "jwks_pkey" PRIMARY KEY ("id")
);
