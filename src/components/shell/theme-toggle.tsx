"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useState } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { THEME_COOKIE, type ThemeMode } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { setThemeAction } from "@/server/actions/account";

const MODES: { mode: ThemeMode; label: string; icon: typeof Sun }[] = [
  { mode: "system", label: "System", icon: Monitor },
  { mode: "light", label: "Light", icon: Sun },
  { mode: "dark", label: "Dark", icon: Moon },
];

/** Writes the cookie and the attribute immediately (no flash), then persists through the DAL. */
export function applyTheme(mode: ThemeMode): void {
  document.cookie = `${THEME_COOKIE}=${mode}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
  const resolved =
    mode === "system"
      ? matchMedia("(prefers-color-scheme: light)").matches
        ? "light"
        : "dark"
      : mode;
  document.documentElement.setAttribute("data-theme", resolved);
}

/**
 * Sidebar footer theme control (spec §3.3): a three-way segmented control when expanded, one
 * cycling icon button when collapsed.
 */
export function ThemeToggle({ initial, collapsed }: { initial: ThemeMode; collapsed: boolean }) {
  const [mode, setMode] = useState<ThemeMode>(initial);

  const choose = (next: ThemeMode) => {
    setMode(next);
    applyTheme(next);
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
            aria-label={`Theme: ${current.label}. Switch to ${next.label}`}
            onClick={() => choose(next.mode)}
            className="flex size-9 items-center justify-center rounded-md text-ink-subtle transition-colors duration-150 hover:bg-surface-1 hover:text-ink focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <Icon aria-hidden className="size-5" strokeWidth={1.5} />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">Theme: {current.label}</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className="flex rounded-md border border-hairline bg-surface-2 p-[2px]"
    >
      {MODES.map(({ mode: m, label, icon: Icon }) => (
        <button
          key={m}
          type="button"
          role="radio"
          aria-checked={mode === m}
          aria-label={label}
          onClick={() => choose(m)}
          className={cn(
            "flex h-7 flex-1 items-center justify-center gap-1 rounded-sm text-app-caption text-ink-subtle transition-colors duration-150 hover:text-ink focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
            mode === m && "bg-surface-3 text-ink",
          )}
        >
          <Icon aria-hidden className="size-4" strokeWidth={1.5} />
          <span className="hidden xl:inline">{label}</span>
        </button>
      ))}
    </div>
  );
}
