"use client";

import { ArrowRight, Briefcase, Check, UserRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState, useEffect, useState, useSyncExternalStore } from "react";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/submit-button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { CURRENCIES, currencyName, pinnedFirst } from "@/lib/geo/currencies";
import { currencyForCountry, guessCountry } from "@/lib/geo/detect";
import { cn } from "@/lib/utils";
import {
  onboardingCompleteAction,
  onboardingStep1Action,
  onboardingStep2Action,
} from "@/server/actions/onboarding";
import type { OnboardingState } from "@/server/dal/onboarding";

const STEPS = ["aboutYou", "howYouUse", "allSet"] as const;

function Steps({ current }: { current: number }) {
  const t = useTranslations("onboarding");
  return (
    <ol
      className="mb-6 flex items-center gap-3 text-app-caption text-ink-subtle"
      aria-label={t("progress")}
    >
      {STEPS.map((key, i) => {
        const n = i + 1;
        const state = n < current ? "done" : n === current ? "current" : "todo";
        return (
          <li
            key={key}
            className="flex items-center gap-2"
            aria-current={state === "current" ? "step" : undefined}
          >
            <span
              className={cn(
                "flex size-6 items-center justify-center rounded-full border text-[11px] font-semibold",
                state === "done" && "border-primary bg-primary text-on-primary",
                state === "current" && "border-primary text-ink",
                state === "todo" && "border-hairline-strong",
              )}
            >
              {state === "done" ? <Check className="size-3.5" strokeWidth={2.5} /> : n}
            </span>
            <span className={cn(state === "current" && "text-ink")}>{t(`steps.${key}`)}</span>
            {n < STEPS.length ? <span aria-hidden className="h-px w-6 bg-hairline" /> : null}
          </li>
        );
      })}
    </ol>
  );
}

function Step1({
  email,
  state,
  countries,
}: {
  email: string;
  state: OnboardingState;
  countries: { code: string; name: string; currency: string }[];
}) {
  const t = useTranslations("onboarding.step1");
  const tc = useTranslations("common");
  const [result, action] = useActionState(onboardingStep1Action, null);
  const errors = result?.fieldErrors;
  const [country, setCountry] = useState(
    result?.values?.countryCode ?? state.step1.countryCode ?? "",
  );
  const [currency, setCurrency] = useState(result?.values?.currency ?? state.step1.currency ?? "");
  const [touched, setTouched] = useState(Boolean(state.step1.currency));

  // Pre-select from the browser (timezone, then language) when nothing is stored yet. The guess
  // is applied after hydration (microtask) so the server-rendered empty select matches first.
  useEffect(() => {
    if (country) return;
    const guessed = guessCountry({
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      language: navigator.language,
    });
    queueMicrotask(() => {
      setCountry(guessed);
      setCurrency(currencyForCountry(guessed));
    });
  }, [country]);

  const onCountry = (code: string) => {
    setCountry(code);
    if (!touched) setCurrency(currencyForCountry(code));
  };
  const currencies = pinnedFirst(CURRENCIES, ["INR", "GBP", "USD"]);

  return (
    <form action={action} className="flex flex-col gap-6">
      <FormMessage state={result} />
      <div>
        <h1 className="text-app-title text-ink">{t("title")}</h1>
        <p className="mt-1 text-app-body text-ink-subtle">{t("subtitle")}</p>
      </div>
      <Card>
        <CardContent className="pt-6">
          <FieldGroup>
            <Field label={t("name")} htmlFor="name" error={errors?.name} required>
              <Input
                id="name"
                name="name"
                defaultValue={result?.values?.name ?? state.step1.name}
                autoFocus
              />
            </Field>
            <Field label={t("email")} htmlFor="email" hint={t("emailHint")}>
              <Input id="email" name="emailDisplay" value={email} readOnly />
            </Field>
            <Field label={t("country")} htmlFor="countryCode" error={errors?.countryCode} required>
              <Select
                id="countryCode"
                name="countryCode"
                value={country}
                onChange={(e) => onCountry(e.target.value)}
              >
                <option value="">{tc("choose")}</option>
                {countries.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label={t("currency")}
              htmlFor="currency"
              error={errors?.currency}
              hint={t("currencyHint")}
              required
            >
              <Select
                id="currency"
                name="currency"
                value={currency}
                onChange={(e) => {
                  setTouched(true);
                  setCurrency(e.target.value);
                }}
              >
                <option value="">{tc("choose")}</option>
                {currencies.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} · {currencyName(c.code)}
                  </option>
                ))}
              </Select>
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>
      <div>
        <SubmitButton pendingLabel={tc("saving")}>{tc("continue")}</SubmitButton>
      </div>
    </form>
  );
}

function Step2({ state }: { state: OnboardingState }) {
  const t = useTranslations("onboarding.step2");
  const tc = useTranslations("common");
  const [result, action] = useActionState(onboardingStep2Action, null);
  const errors = result?.fieldErrors;
  const country = state.step1.countryCode ?? "IN";
  // Uncontrolled inputs: after a failed action React resets the form to its defaults, and the
  // defaults come from the values the action handed back, so nothing the person chose is lost.
  const usage = result?.values?.usage ?? state.step2.usage ?? "PERSONAL";
  const hasTaxId = result?.values?.hasTaxId === "on";
  const taxKind = country === "IN" ? "IN" : country === "GB" ? "GB" : "other";

  return (
    <form action={action} className="flex flex-col gap-6">
      <FormMessage state={result} />
      <input type="hidden" name="countryCode" value={country} />
      <div>
        <h1 className="text-app-title text-ink">{t("title")}</h1>
        <p className="mt-1 text-app-body text-ink-subtle">{t("subtitle")}</p>
      </div>
      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="sr-only">{t("usage")}</legend>
        {(
          [
            ["PERSONAL", "personal", "personalHint", UserRound],
            ["BUSINESS", "business", "businessHint", Briefcase],
          ] as const
        ).map(([value, label, hint, Icon]) => (
          <label
            key={value}
            className="flex cursor-pointer items-start gap-3 rounded-md border border-hairline bg-surface-1 p-4 transition-colors duration-150 hover:bg-surface-2 has-[:checked]:border-primary has-[:checked]:bg-surface-2"
          >
            <input
              type="radio"
              name="usage"
              value={value}
              defaultChecked={usage === value}
              className="mt-1 size-4 accent-primary"
            />
            <Icon
              aria-hidden
              className="mt-0.5 size-5 shrink-0 text-ink-subtle"
              strokeWidth={1.5}
            />
            <span className="flex flex-col">
              <span className="text-app-label text-ink">{t(label)}</span>
              <span className="text-app-caption text-ink-subtle">{t(hint)}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <Card>
        <CardContent className="pt-6">
          {/* The tax-id field shows while "Yes" is checked: a CSS :has() rule, no component state. */}
          <fieldset className="group/tax flex flex-col gap-3">
            <legend className="text-app-label text-ink">{t(`taxQuestion.${taxKind}`)}</legend>
            <div className="flex gap-6">
              <label className="flex items-center gap-2 text-app-body text-ink">
                <input
                  type="radio"
                  name="hasTaxId"
                  value="on"
                  defaultChecked={hasTaxId}
                  className="size-4 accent-primary"
                />
                {tc("yes")}
              </label>
              <label className="flex items-center gap-2 text-app-body text-ink">
                <input
                  type="radio"
                  name="hasTaxId"
                  value="off"
                  defaultChecked={!hasTaxId}
                  className="size-4 accent-primary"
                />
                {tc("no")}
              </label>
            </div>
            <div className="hidden group-has-[input[value=on]:checked]/tax:block">
              <Field label={t(`taxLabel.${taxKind}`)} htmlFor="taxId" error={errors?.taxId}>
                <Input
                  id="taxId"
                  name="taxId"
                  defaultValue={result?.values?.taxId ?? ""}
                  className="font-mono uppercase"
                />
              </Field>
            </div>
          </fieldset>
        </CardContent>
      </Card>
      <div>
        <SubmitButton pendingLabel={tc("saving")}>{tc("continue")}</SubmitButton>
      </div>
    </form>
  );
}

function Step3({ taxId }: { taxId: string }) {
  const t = useTranslations("onboarding.step3");
  return (
    <form action={onboardingCompleteAction} className="flex flex-col gap-6">
      <input type="hidden" name="taxId" value={taxId} />
      <div>
        <h1 className="text-app-title text-ink">{t("title")}</h1>
        <p className="mt-1 text-app-body text-ink-subtle">{t("body")}</p>
      </div>
      <div>
        <SubmitButton pendingLabel={t("opening")}>
          {t("go")}
          <ArrowRight aria-hidden strokeWidth={1.5} />
        </SubmitButton>
      </div>
    </form>
  );
}

/** The three-panel first-run wizard (spec §4.2); each panel autosaves when it continues. */
const noop = () => () => {};

export function OnboardingWizard({
  step,
  email,
  state,
  taxId,
  countries,
}: {
  step: 1 | 2 | 3;
  email: string;
  state: OnboardingState;
  taxId: string;
  countries: { code: string; name: string; currency: string }[];
}) {
  // True once React runs in the browser; tests wait for it before clicking controlled inputs.
  const hydrated = useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
  return (
    <div className="mx-auto w-full max-w-xl" data-hydrated={hydrated}>
      <Steps current={step} />
      {step === 1 ? <Step1 email={email} state={state} countries={countries} /> : null}
      {step === 2 ? <Step2 state={state} /> : null}
      {step === 3 ? <Step3 taxId={taxId} /> : null}
    </div>
  );
}
