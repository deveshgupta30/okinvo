import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { OnboardingWizard } from "@/components/onboarding/wizard";
import { env } from "@/lib/env";
import { countryOptions } from "@/lib/geo/countries";
import { actorFromSession } from "@/server/actor";
import { requireUser } from "@/server/auth";
import { getOnboarding } from "@/server/dal/onboarding";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("onboarding");
  return { title: t("metaTitle") };
}

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const s = await requireUser({ allowOnboarding: true });
  const actor = actorFromSession(s, await headers(), env.TRUST_PROXY);
  const state = await getOnboarding(actor);
  if (state.onboardedAt) redirect("/");
  const params = await searchParams;
  const requested = Number(typeof params.step === "string" ? params.step : "1");
  // Later steps need the earlier answers; fall back to the first incomplete one.
  const step =
    requested >= 2 && !state.step1.countryCode
      ? 1
      : requested >= 3 && !state.step2.usage
        ? 2
        : Math.min(Math.max(requested || 1, 1), 3);
  const taxId = typeof params.taxId === "string" ? params.taxId : "";
  return (
    <OnboardingWizard
      step={step as 1 | 2 | 3}
      email={s.user.email}
      state={state}
      taxId={taxId}
      countries={countryOptions(["IN", "GB", "US"])}
    />
  );
}
