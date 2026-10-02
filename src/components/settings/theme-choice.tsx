"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useState } from "react";
import { applyTheme } from "@/components/shell/theme-toggle";
import type { ThemeMode } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { setThemeAction } from "@/server/actions/account";

const OPTIONS: { mode: ThemeMode; label: string; hint: string; icon: typeof Sun }[] = [
  { mode: "system", label: "Follow the system", hint: "Switches with your OS", icon: Monitor },
  { mode: "light", label: "Light", hint: "White canvas", icon: Sun },
  { mode: "dark", label: "Dark", hint: "Near-black canvas", icon: Moon },
];

/** Settings → Appearance theme cards; same cookie + DAL path as the sidebar toggle. */
export function ThemeChoice({ initial }: { initial: ThemeMode }) {
  const [mode, setMode] = useState<ThemeMode>(initial);
  const choose = (next: ThemeMode) => {
    setMode(next);
    applyTheme(next);
    void setThemeAction(next);
  };
  return (
    <div role="radiogroup" aria-label="Theme" className="grid gap-3 sm:grid-cols-3">
      {OPTIONS.map(({ mode: m, label, hint, icon: Icon }) => (
        <button
          key={m}
          type="button"
          role="radio"
          aria-checked={mode === m}
          onClick={() => choose(m)}
          className={cn(
            "flex items-start gap-3 rounded-md border border-hairline bg-surface-1 p-3 text-left transition-colors duration-150 hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
            mode === m && "border-primary bg-surface-2",
          )}
        >
          <Icon aria-hidden className="mt-0.5 size-5 shrink-0 text-ink-subtle" strokeWidth={1.5} />
          <span className="flex flex-col">
            <span className="text-app-label text-ink">{label}</span>
            <span className="text-app-caption text-ink-subtle">{hint}</span>
          </span>
        </button>
      ))}
    </div>
  );
}
