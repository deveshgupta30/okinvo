"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { isRtl } from "@/lib/i18n/languages";
import { THEME_COOKIE, type ThemeMode } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { setThemeAction } from "@/server/actions/account";

const MODES: { mode: ThemeMode; icon: typeof Sun }[] = [
  { mode: "system", icon: Monitor },
  { mode: "light", icon: Sun },
  { mode: "dark", icon: Moon },
];

function resolve(mode: ThemeMode): "light" | "dark" {
  return mode === "system"
    ? matchMedia("(prefers-color-scheme: light)").matches
      ? "light"
      : "dark"
    : mode;
}

/** Writes the cookie and the attribute immediately (no flash), then persists through the DAL. */
export function applyTheme(mode: ThemeMode): void {
  document.cookie = `${THEME_COOKIE}=${mode}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
  document.documentElement.setAttribute("data-theme", resolve(mode));
}

type ViewTransitionDocument = Document & {
  startViewTransition?: (update: () => void) => { finished: Promise<void> };
};

/**
 * The beui circle-blur reveal (addendum §3) adapted to the cookie + `data-theme` scheme: the
 * new theme grows out of the toggle's corner through the View Transition API where it exists
 * and reduced motion is not requested; otherwise the theme just switches.
 */
export function applyThemeWithTransition(mode: ThemeMode, origin: { x: number; y: number }): void {
  const doc = document as ViewTransitionDocument;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (
    !doc.startViewTransition ||
    reduce ||
    resolve(mode) === document.documentElement.dataset["theme"]
  ) {
    applyTheme(mode);
    return;
  }
  const root = document.documentElement;
  root.style.setProperty("--theme-vt-origin", `${origin.x}px ${origin.y}px`);
  root.dataset["themeVt"] = "circle-blur";
  doc
    .startViewTransition(() => applyTheme(mode))
    .finished.finally(() => {
      delete root.dataset["themeVt"];
    });
}

/**
 * Sidebar footer theme control (spec §3.3): a three-way segmented control when expanded, one
 * cycling icon button when collapsed.
 */
export function ThemeToggle({ initial, collapsed }: { initial: ThemeMode; collapsed: boolean }) {
  const t = useTranslations("shell.theme");
  const tipSide = isRtl(useLocale()) ? "left" : "right";
  const [mode, setMode] = useState<ThemeMode>(initial);

  const choose = (next: ThemeMode, e: React.MouseEvent<HTMLButtonElement>) => {
    setMode(next);
    const rect = e.currentTarget.getBoundingClientRect();
    applyThemeWithTransition(next, {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    });
    void setThemeAction(next);
  };

  if (collapsed) {
    const current = MODES.find((m) => m.mode === mode) ?? MODES[0]!;
    const next = MODES[(MODES.indexOf(current) + 1) % MODES.length]!;
    const Icon = current.icon;
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={t("switchTo", { mode: t(current.mode), next: t(next.mode) })}
            onClick={(e) => choose(next.mode, e)}
            className="flex size-9 items-center justify-center rounded-md text-ink-subtle transition-colors duration-150 hover:bg-surface-1 hover:text-ink focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <Icon aria-hidden className="size-5" strokeWidth={1.5} />
          </button>
        </TooltipTrigger>
        <TooltipContent side={tipSide}>{t("current", { mode: t(current.mode) })}</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <div
      role="radiogroup"
      aria-label={t("label")}
      className="flex rounded-md border border-hairline bg-surface-2 p-[2px]"
    >
      {MODES.map(({ mode: m, icon: Icon }) => (
        <button
          key={m}
          type="button"
          role="radio"
          aria-checked={mode === m}
          aria-label={t(m)}
          onClick={(e) => choose(m, e)}
          className={cn(
            "flex h-7 flex-1 items-center justify-center gap-1 rounded-sm text-app-caption text-ink-subtle transition-colors duration-150 hover:text-ink focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
            mode === m && "bg-surface-3 text-ink",
          )}
        >
          <Icon aria-hidden className="size-4" strokeWidth={1.5} />
          <span className="hidden xl:inline">{t(m)}</span>
        </button>
      ))}
    </div>
  );
}
