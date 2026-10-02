"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { parseForm } from "@/lib/forms";
import { OnboardingStep1Schema, OnboardingStep2Schema } from "@/lib/schemas/onboarding-input";
import { requireUser } from "@/server/auth";
import { actorFromSession } from "@/server/actor";
import { env } from "@/lib/env";
import { headers } from "next/headers";
import { completeOnboarding, saveStep1, saveStep2 } from "@/server/dal/onboarding";
import { failedParse, failedWith, str, type ActionState } from "./shared";

/** The wizard runs before onboarding is complete, so it cannot use the gated helpers. */
async function wizardActor() {
  const s = await requireUser({ allowOnboarding: true });
  return actorFromSession(s, await headers(), env.TRUST_PROXY);
}

export async function onboardingStep1Action(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await wizardActor();
  const parsed = parseForm(OnboardingStep1Schema, formData);
  if (!parsed.ok) return failedParse(parsed, formData);
  try {
    await saveStep1(actor, parsed.data);
  } catch (e) {
    return failedWith(e, formData);
  }
  revalidatePath("/onboarding");
  redirect("/onboarding?step=2");
}

export async function onboardingStep2Action(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await wizardActor();
  const parsed = parseForm(OnboardingStep2Schema, formData);
  if (!parsed.ok) return failedParse(parsed, formData);
  try {
    await saveStep2(actor, { usage: parsed.data.usage });
  } catch (e) {
    return failedWith(e, formData);
  }
  revalidatePath("/onboarding");
  const taxId = parsed.data.taxId;
  redirect(`/onboarding?step=3${taxId ? `&taxId=${encodeURIComponent(taxId)}` : ""}`);
}

/** Step 3's button: marks the wizard done and opens the profile form with the prefill. */
export async function onboardingCompleteAction(formData: FormData): Promise<void> {
  const actor = await wizardActor();
  const taxId = str(formData, "taxId") || null;
  await completeOnboarding(actor, taxId);
  revalidatePath("/", "layout");
  const q = new URLSearchParams({ from: "onboarding" });
  if (taxId) q.set("taxId", taxId);
  redirect(`/settings/profiles/new?${q.toString()}`);
}
