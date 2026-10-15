"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
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

/** Segmented sub-navigation shared by every /settings/* page; tabs the role cannot open are hidden. */
export function SettingsNav({ role }: { role: Role }) {
  const t = useTranslations("settings.nav");
  const pathname = usePathname();
  const items = ITEMS.filter((item) => RANK[role] >= RANK[item.minRole]);
  return (
    <nav aria-label={t("label")} className="mb-6 flex flex-wrap gap-1 rounded-md bg-surface-2 p-1">
      {items.map((item) => {
        const active = pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "h-7 rounded-sm px-3 text-app-body leading-7 text-ink-subtle transition-colors duration-150 hover:text-ink",
              active && "bg-surface-3 text-ink",
            )}
          >
            {t(item.key)}
          </Link>
        );
      })}
    </nav>
  );
}
