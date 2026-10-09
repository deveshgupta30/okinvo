import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Actor } from "@/server/actor";

/**
 * First-run wizard (spec §4.2): answers land on the User row through audited DAL calls, the
 * wizard is finished exactly once, and completion hands the profile form its prefill.
 */
const url = process.env.DATABASE_URL;
if (!url && process.env.CI) throw new Error("DATABASE_URL is required when CI is set");

describe.skipIf(!url)("onboarding DAL", () => {
  const id = `onb-${Date.now()}`;
  const actor: Actor = {
    userId: id,
    email: `${id}@example.com`,
    name: "New Person",
    role: "OWNER",
    timezone: "Asia/Kolkata",
    locale: "en-US",
  };
  let prisma: typeof import("@/lib/db").prisma;
  let onboarding: typeof import("@/server/dal/onboarding");

  beforeAll(async () => {
    ({ prisma } = await import("@/lib/db"));
    onboarding = await import("@/server/dal/onboarding");
    await prisma.user.create({ data: { id, name: "New Person", email: actor.email } });
  });

  afterAll(async () => {
    await prisma.auditEvent.deleteMany({ where: { entityId: id } });
    await prisma.user.deleteMany({ where: { id } });
  });

  it("starts un-onboarded with empty answers", async () => {
    const state = await onboarding.getOnboarding(actor);
    expect(state.onboardedAt).toBeNull();
    expect(state.step1).toEqual({ name: "New Person", countryCode: null, currency: null });
    expect(state.step2).toEqual({ usage: null });
  });

  it("saves step 1 and step 2 on the user row and audits them", async () => {
    await onboarding.saveStep1(actor, { name: "Asha Rao", countryCode: "IN", currency: "INR" });
    await onboarding.saveStep2(actor, { usage: "BUSINESS" });
    const row = await prisma.user.findUniqueOrThrow({ where: { id } });
    expect(row).toMatchObject({
      name: "Asha Rao",
      countryCode: "IN",
      currency: "INR",
      usage: "BUSINESS",
    });
    const events = await prisma.auditEvent.findMany({
      where: { entityId: id, action: "account.updated" },
    });
    expect(events.length).toBeGreaterThanOrEqual(2);
    const state = await onboarding.getOnboarding(actor);
    expect(state.step1).toEqual({ name: "Asha Rao", countryCode: "IN", currency: "INR" });
    expect(state.step2).toEqual({ usage: "BUSINESS" });
  });

  it("completes once, returns the prefill, and is idempotent afterwards", async () => {
    const first = await onboarding.completeOnboarding(actor, "27AAPFU0939F1ZV");
    expect(first.prefill).toMatchObject({
      type: "COMPANY",
      legalName: "Asha Rao",
      countryCode: "IN",
      baseCurrency: "INR",
      defaultTaxRegime: "INDIA_GST",
      gstin: "27AAPFU0939F1ZV",
    });
    const row = await prisma.user.findUniqueOrThrow({ where: { id } });
    expect(row.onboardedAt).not.toBeNull();
    const event = await prisma.auditEvent.findFirst({
      where: { entityId: id, action: "account.onboarded" },
    });
    expect(event).not.toBeNull();
    const again = await onboarding.completeOnboarding(actor, null);
    const row2 = await prisma.user.findUniqueOrThrow({ where: { id } });
    expect(row2.onboardedAt?.getTime()).toBe(row.onboardedAt?.getTime());
    expect(again.prefill.legalName).toBe("Asha Rao");
    expect(
      await prisma.auditEvent.count({ where: { entityId: id, action: "account.onboarded" } }),
    ).toBe(1);
  });
});
