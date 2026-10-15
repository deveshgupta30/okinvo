"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen, Settings } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import {
  AnimatedSidebar,
  AnimatedSidebarContent,
  AnimatedSidebarFooter,
  AnimatedSidebarHeader,
  useAnimatedSidebar,
} from "@/components/motion/animated-sidebar";
import { Mark, Wordmark } from "@/components/brand/logo";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { isRtl } from "@/lib/i18n/languages";
import type { ThemeMode } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { PrimaryNav } from "./nav";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu, type ShellUser } from "./user-menu";

export interface SidebarProps {
  user: ShellUser;
  theme: ThemeMode;
  minimal?: boolean;
}

/**
 * The app sidebar (spec §3.3) on beui's animated sidebar: a 240 px panel that folds into a
 * 64 px icon rail on desktop and becomes the navigation sheet on phones. Footer order: theme
 * toggle, Settings, user menu. The open state lives in the provider (AppShell), which keeps
 * the `okinvo.sidebar` cookie in step.
 */
export function Sidebar({ user, theme, minimal = false }: SidebarProps) {
  const t = useTranslations("shell");
  const tc = useTranslations("common");
  const tipSide = isRtl(useLocale()) ? "left" : "right";
  const { open, isMobile, toggleSidebar, setOpenMobile } = useAnimatedSidebar();
  const collapsed = !isMobile && !open;
  const pathname = usePathname();
  const settingsActive = pathname.startsWith("/settings");
  const closeMobile = () => setOpenMobile(false);

  const settingsLink = (
    <Link
      href="/settings"
      aria-current={settingsActive ? "page" : undefined}
      onClick={closeMobile}
      className={cn(
        "relative flex h-9 items-center gap-3 rounded-md px-3 text-app-body text-ink-subtle transition-colors duration-150 hover:bg-surface-1 hover:text-ink focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
        collapsed && "justify-center px-0",
        settingsActive &&
          "bg-sidebar-accent text-ink before:absolute before:start-0 before:top-1 before:bottom-1 before:w-[2px] before:rounded-full before:bg-primary",
      )}
    >
      <Settings aria-hidden className="size-5 shrink-0" strokeWidth={1.5} />
      <span className={cn("truncate", collapsed && "sr-only")}>{t("settings")}</span>
    </Link>
  );

  return (
    <TooltipProvider delay={300}>
      <AnimatedSidebar
        ariaLabel={t("navigation")}
        data-sidebar={open ? "expanded" : "collapsed"}
        className="z-30"
        panelClassName="border-sidebar-border bg-sidebar"
      >
        <AnimatedSidebarHeader
          className={cn(
            "flex h-14 flex-row items-center gap-2 px-3",
            collapsed && "justify-center px-0",
          )}
        >
          <Link
            href="/"
            aria-label={tc("home")}
            onClick={closeMobile}
            className="flex min-w-0 items-center text-ink focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            {collapsed ? (
              <Mark title={tc("appName")} className="size-8" />
            ) : (
              <Wordmark title={tc("appName")} className="h-7 w-auto" />
            )}
          </Link>
          {isMobile ? null : collapsed ? null : (
            <button
              type="button"
              onClick={toggleSidebar}
              aria-label={t("collapseSidebar")}
              title={t("collapseSidebarHint")}
              className="ms-auto flex size-8 items-center justify-center rounded-md text-ink-subtle transition-colors duration-150 hover:bg-surface-1 hover:text-ink focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <PanelLeftClose aria-hidden className="size-5" strokeWidth={1.5} />
            </button>
          )}
        </AnimatedSidebarHeader>
        {collapsed ? (
          <div className="flex justify-center pb-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={toggleSidebar}
                  aria-label={t("expandSidebar")}
                  className="flex size-8 items-center justify-center rounded-md text-ink-subtle transition-colors duration-150 hover:bg-surface-1 hover:text-ink focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  <PanelLeftOpen aria-hidden className="size-5" strokeWidth={1.5} />
                </button>
              </TooltipTrigger>
              <TooltipContent side={tipSide}>{t("expandSidebarHint")}</TooltipContent>
            </Tooltip>
          </div>
        ) : null}

        <AnimatedSidebarContent className="px-2 py-0">
          {minimal ? null : <PrimaryNav collapsed={collapsed} onNavigate={closeMobile} />}
        </AnimatedSidebarContent>

        <AnimatedSidebarFooter
          className={cn("gap-2 border-sidebar-border p-2", collapsed && "items-center")}
        >
          <ThemeToggle initial={theme} collapsed={collapsed} />
          {minimal ? null : collapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>{settingsLink}</TooltipTrigger>
              <TooltipContent side={tipSide}>{t("settings")}</TooltipContent>
            </Tooltip>
          ) : (
            settingsLink
          )}
          <UserMenu user={user} collapsed={collapsed} side={isMobile ? "top" : tipSide} />
        </AnimatedSidebarFooter>
      </AnimatedSidebar>
    </TooltipProvider>
  );
}
