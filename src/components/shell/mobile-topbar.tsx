"use client";

import Link from "next/link";
import { Menu } from "lucide-react";
import { useTranslations } from "next-intl";
import { useAnimatedSidebar } from "@/components/motion/animated-sidebar";
import { Mark } from "@/components/brand/logo";
import { UserMenu, type ShellUser } from "./user-menu";

/**
 * Below `md`: a sticky top bar with the mark, the menu button that opens the navigation sheet
 * (the sidebar rendered by beui as a dialog on phones) and the user menu.
 */
export function MobileTopbar({ user }: { user: ShellUser }) {
  const t = useTranslations("shell");
  const tc = useTranslations("common");
  const { openMobile, setOpenMobile } = useAnimatedSidebar();
  return (
    <header className="sticky top-0 z-40 flex h-12 items-center gap-3 border-b border-hairline bg-canvas px-3 md:hidden">
      <button
        type="button"
        aria-label={t("openMenu")}
        aria-expanded={openMobile}
        onClick={() => setOpenMobile(true)}
        className="flex size-9 items-center justify-center rounded-md text-ink-subtle hover:bg-surface-1 hover:text-ink focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <Menu aria-hidden className="size-5" strokeWidth={1.5} />
      </button>
      <Link href="/" aria-label={tc("home")} className="flex items-center text-ink">
        <Mark title={tc("appName")} className="size-7" />
      </Link>
      <span className="ms-auto">
        <UserMenu user={user} collapsed side="top" />
      </span>
    </header>
  );
}
