"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileText, LayoutDashboard, Menu, Settings, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { useAnimatedSidebar } from "@/components/motion/animated-sidebar";
import { Dock as BeuiDock, DockItem } from "@/components/motion/dock";
import { cn } from "@/lib/utils";
import { isActivePath } from "./nav";

const ITEMS = [
  { href: "/", key: "dashboard", icon: LayoutDashboard },
  { href: "/invoices", key: "invoices", icon: FileText },
  { href: "/clients", key: "clients", icon: Users },
  { href: "/settings", key: "settings", icon: Settings },
] as const;

/**
 * Phone bottom navigation (addendum §3): the four main destinations and a "more" item that
 * opens the navigation sheet with everything else. Hidden from `md` up, where the sidebar is.
 */
export function Dock() {
  const t = useTranslations("shell");
  const pathname = usePathname();
  const { setOpenMobile } = useAnimatedSidebar();
  return (
    <nav
      aria-label={t("dock")}
      data-dock
      className="fixed inset-x-0 bottom-0 z-40 flex justify-center pb-[max(0.5rem,env(safe-area-inset-bottom))] md:hidden"
    >
      <BeuiDock size={48} className="border-hairline-strong bg-surface-1/90">
        {ITEMS.map(({ href, key, icon: Icon }) => {
          const active = isActivePath(pathname, href);
          const label = key === "settings" ? t("settings") : t(`nav.${key}`);
          return (
            <DockItem key={href} active={active}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                aria-label={label}
                className={cn(
                  "flex size-full flex-col items-center justify-center gap-0.5 rounded-xl text-ink-subtle",
                  active && "text-ink",
                )}
              >
                <Icon aria-hidden className="size-5" strokeWidth={1.5} />
                <span className="text-[10px] leading-none">{label}</span>
              </Link>
            </DockItem>
          );
        })}
        <DockItem onClick={() => setOpenMobile(true)}>
          <span className="flex size-full flex-col items-center justify-center gap-0.5 text-ink-subtle">
            <Menu aria-hidden className="size-5" strokeWidth={1.5} />
            <span className="text-[10px] leading-none">{t("more")}</span>
          </span>
        </DockItem>
      </BeuiDock>
    </nav>
  );
}
