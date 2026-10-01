-- Exactly one non-archived default per table. Prisma cannot express partial unique indexes
-- (IMPLEMENTATION_PLAN_v2.md §7.2), so they live here. `((true))` indexes a constant, so the
-- uniqueness applies to the whole filtered set.
CREATE UNIQUE INDEX "IssuerProfile_single_default"
  ON "IssuerProfile" ((true))
  WHERE "isDefault" = true AND "archivedAt" IS NULL;

CREATE UNIQUE INDEX "PaymentMethodProfile_single_default"
  ON "PaymentMethodProfile" ((true))
  WHERE "isDefault" = true AND "archivedAt" IS NULL;
