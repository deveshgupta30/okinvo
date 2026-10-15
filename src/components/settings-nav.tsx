"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import { useTranslations } from "next-intl";
import { useEffect, useId, useRef } from "react";
import { cn } from "@/lib/utils";
import type { Role } from "@/server/actor";

const ITEMS = [
  { href: "/settings/profiles", key: "profiles", minRole: "OWNER" },
  { href: "/settings/payment-methods", key: "paymentMethods", minRole: "OWNER" },
  { href: "/settings/templates", key: "templates", minRole: "OWNER" },
  { href: "/settings/email", key: "email", minRole: "OWNER" },
  { href: "/settings/security", key: "security", minRole: "OWNER" },
  { href: "/settings/users", key: "users", minRole: "OWNER" },
  { href: "/settings/data", key: "data", minRole: "OWNER" },
  { href: "/settings/legal", key: "legal", minRole: "OWNER" },
  { href: "/settings/einvoicing", key: "einvoicing", minRole: "OWNER" },
  { href: "/settings/account", key: "account", minRole: "VIEWER" },
  { href: "/settings/appearance", key: "appearance", minRole: "VIEWER" },
  { href: "/settings/api", key: "api", minRole: "VIEWER" },
  { href: "/settings/status", key: "status", minRole: "VIEWER" },
  { href: "/settings/usage", key: "usage", minRole: "OWNER" },
] as const;

const RANK: Record<Role, number> = { VIEWER: 0, EDITOR: 1, OWNER: 2 };

/**
 * Sub-navigation shared by every /settings/* page: links (so they crawl, open in new tabs and
 * read as navigation) in a segment that scrolls sideways when the tabs overflow, with the
 * active pill gliding between them like beui's tabs. Tabs the role cannot open are hidden.
 */
export function SettingsNav({ role }: { role: Role }) {
  const t = useTranslations("settings.nav");
  const pathname = usePathname();
  const reduce = useReducedMotion();
  const layoutId = useId();
  const listRef = useRef<HTMLElement>(null);
  const items = ITEMS.filter((item) => RANK[role] >= RANK[item.minRole]);

  // Keep the active tab in view when the row overflows (phones, narrow windows).
  useEffect(() => {
    const active = listRef.current?.querySelector<HTMLElement>('[aria-current="page"]');
    active?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [pathname]);

  return (
    <nav
      ref={listRef}
      aria-label={t("label")}
      className="mb-6 flex [scrollbar-width:none] gap-1 overflow-x-auto rounded-md bg-surface-2 p-1 [&::-webkit-scrollbar]:hidden"
    >
      {items.map((item) => {
        const active = pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative h-7 shrink-0 rounded-sm px-3 text-app-body leading-7 whitespace-nowrap text-ink-subtle transition-colors duration-150 hover:text-ink",
              active && "text-ink",
            )}
          >
            {active ? (
              <motion.span
                layoutId={layoutId}
                transition={
                  reduce ? { duration: 0 } : { type: "spring", stiffness: 360, damping: 32 }
                }
                className="absolute inset-0 -z-10 rounded-sm bg-surface-3"
              />
            ) : null}
            {t(item.key)}
          </Link>
        );
      })}
    </nav>
  );
}
