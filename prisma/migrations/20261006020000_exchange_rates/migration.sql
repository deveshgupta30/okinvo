-- Exchange-rate snapshots (addendum §5): one table per day from the optional live refresh.
CREATE TABLE "ExchangeRateSnapshot" (
    "id" TEXT NOT NULL,
    "asOf" DATE NOT NULL,
    "base" VARCHAR(3) NOT NULL DEFAULT 'USD',
    "rates" JSONB NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExchangeRateSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ExchangeRateSnapshot_asOf_key" ON "ExchangeRateSnapshot"("asOf");
