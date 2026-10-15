"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  ColorSelector,
  ColorSelectorItem,
  ColorSelectorList,
} from "@/components/motion/color-selector";
import {
  ACCENTS,
  type Accent,
  type AccentId,
  accentAttribute,
  accentHex,
  applyAccentToDocument,
  customAccent,
  isAccent,
} from "@/lib/accent";
import { setAccentAction } from "@/server/actions/account";

/** Static class names so Tailwind emits every accent's raw token (the swatch dot reads the same variable). */
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

/**
 * Settings → Appearance (spec §3.4, addendum §3): the eight pastel swatches on beui's colour
 * selector plus a ninth, custom swatch fed by a native colour input. The custom value is kept
 * as `custom-<hex>` in the cookie and the account, applied through the four
 * `--accent-custom-*` variables (src/lib/accent.ts).
 */
export function AccentPicker({ initial }: { initial: Accent }) {
  const t = useTranslations("settings.appearance");
  const [accent, setAccent] = useState<Accent>(initial);
  // The colour input needs a hex; until the person picks one, it mirrors the current primary.
  const [customHex, setCustomHex] = useState(() => accentHex(initial) ?? "");
  // The colour input needs a hex: the first time it is touched, it starts from the current primary.
  const primeCustomHex = () => {
    if (customHex) return;
    const primary = getComputedStyle(document.documentElement)
      .getPropertyValue("--color-primary")
      .trim();
    if (primary) setCustomHex(primary);
  };

  const choose = (next: Accent) => {
    setAccent(next);
    applyAccentToDocument(next);
    void setAccentAction(next);
  };

  const onSelect = (value: string) => {
    if (isAccent(value)) choose(value);
    else if (value === "custom") {
      const c = customAccent(customHex);
      if (c) choose(c);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <ColorSelector
        role="radiogroup"
        aria-label={t("accent.label")}
        value={accentAttribute(accent)}
        onValueChange={onSelect}
      >
        <ColorSelectorList data-accent-swatches className="flex flex-wrap items-center gap-3">
          {ACCENTS.map((id) => (
            <ColorSelectorItem
              key={id}
              value={id}
              color={`var(--color-accent-${id}-primary)`}
              label={t(`accents.${id}`)}
              className={cn("size-9 border-hairline-strong", SWATCH[id])}
            />
          ))}
          <ColorSelectorItem
            value="custom"
            color={customHex || "var(--color-primary)"}
            label={t("accents.custom")}
            className="size-9 border-hairline-strong"
            style={{ backgroundColor: customHex || "var(--color-primary)" }}
          />
        </ColorSelectorList>
      </ColorSelector>
      <label className="flex items-center gap-2 text-app-caption text-ink-subtle">
        <input
          type="color"
          key={customHex ? "set" : "unset"}
          {...(customHex ? { value: customHex } : {})}
          onPointerEnter={primeCustomHex}
          onFocus={primeCustomHex}
          onChange={(e) => {
            setCustomHex(e.target.value);
            const c = customAccent(e.target.value);
            if (c) choose(c);
          }}
          className="size-8 cursor-pointer rounded-md border border-hairline bg-transparent p-0"
        />
        {t("accent.customHint")}
      </label>
    </div>
  );
}
