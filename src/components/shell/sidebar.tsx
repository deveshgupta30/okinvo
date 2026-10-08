"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen, Settings } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Mark, Wordmark } from "@/components/brand/logo";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { AccentId } from "@/lib/accent";
import { sidebarCookie, type SidebarState } from "@/lib/sidebar";
import type { ThemeMode } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { PrimaryNav } from "./nav";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu, type ShellUser } from "./user-menu";

export interface SidebarProps {
  user: ShellUser;
  initial: SidebarState;
  theme: ThemeMode;
  accent: AccentId;
  minimal?: boolean;
}

/**
 * Desktop sidebar (spec §3.3): 240 px expanded, 64 px icon rail collapsed, sticky for the full
 * viewport height, footer order theme toggle → Settings → user. State persists in a cookie the
 * server reads for the first paint; `[` toggles it from the keyboard.
 */
export function Sidebar({ user, initial, theme, minimal = false }: SidebarProps) {
  const t = useTranslations("shell");
  const tc = useTranslations("common");
  const [state, setState] = useState<SidebarState>(initial);
  const collapsed = state === "collapsed";
  const pathname = usePathname();
  const settingsActive = pathname.startsWith("/settings");

  const toggle = () => {
    const next: SidebarState = collapsed ? "expanded" : "collapsed";
    setState(next);
    document.cookie = sidebarCookie(next);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (e.key === "[" && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const settingsLink = (
    <Link
      href="/settings"
      aria-current={settingsActive ? "page" : undefined}
      className={cn(
        "relative flex h-9 items-center gap-3 rounded-md px-3 text-app-body text-ink-subtle transition-colors duration-150 hover:bg-surface-1 hover:text-ink focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
        collapsed && "justify-center px-0",
        settingsActive &&
          "bg-sidebar-accent text-ink before:absolute before:top-1 before:bottom-1 before:left-0 before:w-[2px] before:rounded-full before:bg-primary",
      )}
    >
      <Settings aria-hidden className="size-5 shrink-0" strokeWidth={1.5} />
      <span className={cn("truncate", collapsed && "sr-only")}>{t("settings")}</span>
    </Link>
  );

  return (
    <TooltipProvider delayDuration={300}>
      <aside
        data-sidebar={state}
        className={cn(
          "sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-200 ease-out motion-reduce:transition-none md:flex",
          collapsed ? "w-16" : "w-60",
        )}
      >
        <div
          className={cn("flex h-14 items-center gap-2 px-3", collapsed && "justify-center px-0")}
        >
          <Link
            href="/"
            aria-label={tc("home")}
            className="flex min-w-0 items-center text-ink focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            {collapsed ? (
              <Mark title={tc("appName")} className="size-8" />
            ) : (
              <Wordmark title={tc("appName")} className="h-7 w-auto" />
            )}
          </Link>
          {collapsed ? null : (
            <button
              type="button"
              onClick={toggle}
              aria-label={t("collapseSidebar")}
              title={t("collapseSidebarHint")}
              className="ml-auto flex size-8 items-center justify-center rounded-md text-ink-subtle transition-colors duration-150 hover:bg-surface-1 hover:text-ink focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <PanelLeftClose aria-hidden className="size-5" strokeWidth={1.5} />
            </button>
          )}
        </div>
        {collapsed ? (
          <div className="flex justify-center pb-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={toggle}
                  aria-label={t("expandSidebar")}
                  className="flex size-8 items-center justify-center rounded-md text-ink-subtle transition-colors duration-150 hover:bg-surface-1 hover:text-ink focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  <PanelLeftOpen aria-hidden className="size-5" strokeWidth={1.5} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">{t("expandSidebarHint")}</TooltipContent>
            </Tooltip>
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto px-2">
          {minimal ? null : <PrimaryNav collapsed={collapsed} />}
        </div>

        <div
          className={cn(
            "flex flex-col gap-2 border-t border-sidebar-border p-2",
            collapsed && "items-center",
          )}
        >
          <ThemeToggle initial={theme} collapsed={collapsed} />
          {minimal ? null : collapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>{settingsLink}</TooltipTrigger>
              <TooltipContent side="right">{t("settings")}</TooltipContent>
            </Tooltip>
          ) : (
            settingsLink
          )}
          <UserMenu user={user} collapsed={collapsed} side="right" />
        </div>
      </aside>
    </TooltipProvider>
  );
}
