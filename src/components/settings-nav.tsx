"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/settings/profiles", label: "Profiles" },
  { href: "/settings/payment-methods", label: "Payment methods" },
  { href: "/settings/templates", label: "Templates" },
  { href: "/settings/email", label: "Email" },
  { href: "/settings/security", label: "Security" },
  { href: "/settings/users", label: "Users" },
  { href: "/settings/data", label: "Data" },
  { href: "/settings/account", label: "Account" },
  { href: "/settings/appearance", label: "Appearance" },
] as const;

/** Segmented sub-navigation shared by every /settings/* page. */
export function SettingsNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Settings" className="mb-6 flex flex-wrap gap-1 rounded-md bg-surface-2 p-1">
      {ITEMS.map((item) => {
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
