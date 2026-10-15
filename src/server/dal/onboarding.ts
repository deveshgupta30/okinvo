import "server-only";
import { prisma } from "@/lib/db";
import { profilePrefill, type ProfilePrefill } from "@/lib/onboarding/prefill";
import type { Usage } from "@/lib/schemas/account-input";
import { USAGES } from "@/lib/schemas/account-input";
import type { OnboardingStep1 } from "@/lib/schemas/onboarding-input";
import type { Actor } from "@/server/actor";
import { audit } from "./audit";
import { diffForAudit } from "./audit-redact";
import { NotFoundError } from "./errors";

export interface OnboardingState {
  onboardedAt: Date | null;
  step1: { name: string; countryCode: string | null; currency: string | null };
  step2: { usage: Usage | null };
}

const usageOf = (v: string | null): Usage | null =>
  v && (USAGES as readonly string[]).includes(v) ? (v as Usage) : null;

async function row(userId: string) {
  const u = await prisma.user.findUnique({ where: { id: userId } });
  if (!u) throw new NotFoundError("User", userId);
  return u;
}

export async function getOnboarding(actor: Actor): Promise<OnboardingState> {
  const u = await row(actor.userId);
  return {
    onboardedAt: u.onboardedAt,
    step1: { name: u.name, countryCode: u.countryCode, currency: u.currency },
    step2: { usage: usageOf(u.usage) },
  };
}

const view = (u: {
  name: string;
  countryCode: string | null;
  currency: string | null;
  usage: string | null;
}) => ({
  name: u.name,
  countryCode: u.countryCode,
  currency: u.currency,
  usage: u.usage,
});

/** Step 1 autosave: the answers live on the User row, audited like any account change. */
export async function saveStep1(actor: Actor, input: OnboardingStep1): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const before = await tx.user.findUniqueOrThrow({ where: { id: actor.userId } });
    const after = await tx.user.update({
      where: { id: actor.userId },
      data: { name: input.name, countryCode: input.countryCode, currency: input.currency },
    });
    const diff = diffForAudit(view(before), view(after));
    await audit(tx, actor, "account.updated", "User", actor.userId, {
      summary: "Onboarding: name, country and currency",
      before: diff.before,
      after: diff.after,
    });
  });
}

export async function saveStep2(actor: Actor, input: { usage: Usage }): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const before = await tx.user.findUniqueOrThrow({ where: { id: actor.userId } });
    const after = await tx.user.update({
      where: { id: actor.userId },
      data: { usage: input.usage },
    });
    const diff = diffForAudit(view(before), view(after));
    await audit(tx, actor, "account.updated", "User", actor.userId, {
      summary: "Onboarding: usage",
      before: diff.before,
      after: diff.after,
    });
  });
}

/**
 * Marks the wizard done (once; later calls are no-ops) and returns what the profile form should
 * start with. The tax id is not stored on the user: it belongs to the issuer profile.
 */
export async function completeOnboarding(
  actor: Actor,
  taxId: string | null,
): Promise<{ prefill: ProfilePrefill }> {
  const u = await prisma.$transaction(async (tx) => {
    const current = await tx.user.findUniqueOrThrow({ where: { id: actor.userId } });
    if (current.onboardedAt) return current;
    const done = await tx.user.update({
      where: { id: actor.userId },
      data: { onboardedAt: new Date() },
    });
    await audit(tx, actor, "account.onboarded", "User", actor.userId, {
      summary: "Finished onboarding",
      after: { onboardedAt: done.onboardedAt?.toISOString() ?? null, usage: done.usage },
    });
    return done;
  });
  return {
    prefill: profilePrefill(
      {
        name: u.name,
        email: u.email,
        countryCode: u.countryCode,
        currency: u.currency,
        locale: u.locale,
        usage: usageOf(u.usage),
      },
      taxId,
    ),
  };
}
