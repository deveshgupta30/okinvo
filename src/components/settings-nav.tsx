"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { Role } from "@/server/actor";

const ITEMS = [
  { href: "/settings/profiles", label: "Profiles", minRole: "OWNER" },
  { href: "/settings/payment-methods", label: "Payment methods", minRole: "OWNER" },
  { href: "/settings/templates", label: "Templates", minRole: "OWNER" },
  { href: "/settings/email", label: "Email", minRole: "OWNER" },
  { href: "/settings/security", label: "Security", minRole: "OWNER" },
  { href: "/settings/users", label: "Users", minRole: "OWNER" },
  { href: "/settings/data", label: "Data", minRole: "OWNER" },
  { href: "/settings/legal", label: "Legal", minRole: "OWNER" },
  { href: "/settings/account", label: "Account", minRole: "VIEWER" },
  { href: "/settings/appearance", label: "Appearance", minRole: "VIEWER" },
  { href: "/settings/status", label: "Status", minRole: "VIEWER" },
] as const;

const RANK: Record<Role, number> = { VIEWER: 0, EDITOR: 1, OWNER: 2 };

/** Segmented sub-navigation shared by every /settings/* page; tabs the role cannot open are hidden. */
export function SettingsNav({ role }: { role: Role }) {
  const pathname = usePathname();
  const items = ITEMS.filter((item) => RANK[role] >= RANK[item.minRole]);
  return (
    <nav aria-label="Settings" className="mb-6 flex flex-wrap gap-1 rounded-md bg-surface-2 p-1">
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
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
