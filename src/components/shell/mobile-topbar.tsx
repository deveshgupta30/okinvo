"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Settings } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Mark, Wordmark } from "@/components/brand/logo";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { ThemeMode } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { PrimaryNav } from "./nav";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu, type ShellUser } from "./user-menu";

/**
 * Below `md`: a sticky top bar with the mark and a menu button that opens the navigation as a
 * drawer (spec §3.3). The drawer closes on navigation and keeps the sidebar's footer order.
 */
export function MobileTopbar({
  user,
  theme,
  minimal = false,
}: {
  user: ShellUser;
  theme: ThemeMode;
  minimal?: boolean;
}) {
  const t = useTranslations("shell");
  const tc = useTranslations("common");
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const settingsActive = pathname.startsWith("/settings");

  // Close on navigation: derived during render (no effect), per React's guidance.
  const [seenPath, setSeenPath] = useState(pathname);
  if (pathname !== seenPath) {
    setSeenPath(pathname);
    setOpen(false);
  }

  return (
    <header className="sticky top-0 z-40 flex h-12 items-center gap-3 border-b border-hairline bg-canvas px-3 md:hidden">
      <button
        type="button"
        aria-label={t("openMenu")}
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="flex size-9 items-center justify-center rounded-md text-ink-subtle hover:bg-surface-1 hover:text-ink focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <Menu aria-hidden className="size-5" strokeWidth={1.5} />
      </button>
      <Link href="/" aria-label={tc("home")} className="flex items-center text-ink">
        <Mark title={tc("appName")} className="size-7" />
      </Link>
      <span className="ml-auto">
        <UserMenu user={user} collapsed side="top" />
      </span>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent aria-describedby={undefined}>
          <SheetTitle className="sr-only">{t("navigation")}</SheetTitle>
          <SheetDescription className="sr-only">{t("pagesAndAccount")}</SheetDescription>
          <div className="flex h-14 items-center px-4 text-ink">
            <Wordmark title={tc("appName")} className="h-7 w-auto" />
          </div>
          <TooltipProvider>
            <div className="min-h-0 flex-1 overflow-y-auto px-2">
              {minimal ? null : <PrimaryNav collapsed={false} onNavigate={() => setOpen(false)} />}
            </div>
            <div className="flex flex-col gap-2 border-t border-hairline p-2">
              <ThemeToggle initial={theme} collapsed={false} />
              {minimal ? null : (
                <Link
                  href="/settings"
                  onClick={() => setOpen(false)}
                  aria-current={settingsActive ? "page" : undefined}
                  className={cn(
                    "relative flex h-9 items-center gap-3 rounded-md px-3 text-app-body text-ink-subtle hover:bg-surface-2 hover:text-ink",
                    settingsActive && "bg-surface-2 text-ink",
                  )}
                >
                  <Settings aria-hidden className="size-5" strokeWidth={1.5} />
                  {t("settings")}
                </Link>
              )}
              <UserMenu user={user} collapsed={false} side="top" />
            </div>
          </TooltipProvider>
        </SheetContent>
      </Sheet>
    </header>
  );
}
