"use client";

import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { ACCENTS, ACCENT_COOKIE, type AccentId } from "@/lib/accent";
import { cn } from "@/lib/utils";
import { setAccentAction } from "@/server/actions/account";

/** Static class names so Tailwind sees every swatch colour (the raw accent tokens). */
const SWATCH: Record<AccentId, string> = {
  mint: "bg-accent-mint-primary",
  lavender: "bg-accent-lavender-primary",
  sky: "bg-accent-sky-primary",
  peach: "bg-accent-peach-primary",
  butter: "bg-accent-butter-primary",
  rose: "bg-accent-rose-primary",
  sage: "bg-accent-sage-primary",
  lilac: "bg-accent-lilac-primary",
};

/** Applies the accent immediately (attribute + cookie) so there is no flash before the action lands. */
function applyAccent(id: AccentId): void {
  document.documentElement.setAttribute("data-accent", id);
  document.cookie = `${ACCENT_COOKIE}=${id}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
}

/** Settings → Appearance (spec §3.4): eight pastel swatches with a live preview. */
export function AccentPicker({ initial }: { initial: AccentId }) {
  const t = useTranslations("settings.appearance");
  const [accent, setAccent] = useState<AccentId>(initial);
  const choose = (id: AccentId) => {
    setAccent(id);
    applyAccent(id);
    void setAccentAction(id);
  };
  return (
    <div role="radiogroup" aria-label={t("accent.label")} className="flex flex-wrap gap-3">
      {ACCENTS.map((id) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={accent === id}
          aria-label={t(`accents.${id}`)}
          onClick={() => choose(id)}
          className={cn(
            "flex flex-col items-center gap-1 rounded-md p-2 text-app-caption text-ink-subtle transition-colors duration-150 hover:bg-surface-1 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
            accent === id && "bg-surface-1 text-ink",
          )}
        >
          <span
            aria-hidden
            className={cn(
              "flex size-9 items-center justify-center rounded-full border border-hairline-strong text-on-primary transition-transform duration-150",
              SWATCH[id],
              accent === id && "scale-110",
            )}
          >
            {accent === id ? <Check className="size-4" strokeWidth={2} /> : null}
          </span>
          {t(`accents.${id}`)}
        </button>
      ))}
    </div>
  );
}
