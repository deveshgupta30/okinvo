-- Accounts created before the first-run wizard existed have already set themselves up:
-- treat them as onboarded so the gate (requireUser) does not send them to the wizard.
UPDATE "user" SET "onboardedAt" = NOW() WHERE "onboardedAt" IS NULL;
