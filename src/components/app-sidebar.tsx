"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileText, LayoutDashboard, Receipt, Settings, Users, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/invoices", label: "Invoices", icon: FileText },
  { href: "/credit-notes", label: "Credit notes", icon: Receipt },
  { href: "/clients", label: "Clients", icon: Users },
  { href: "/services", label: "Services", icon: Wrench },
  { href: "/settings/profiles", label: "Settings", icon: Settings },
] as const;

export function AppSidebar() {
  const pathname = usePathname();
  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
      <div className="flex h-12 items-center gap-3 px-4">
        <span
          aria-hidden
          className="flex size-6 items-center justify-center rounded-sm bg-primary text-app-caption font-semibold text-on-primary"
        >
          ok
        </span>
        <span className="text-app-label text-ink">okinvo</span>
      </div>
      <nav aria-label="Primary" className="flex flex-col gap-[2px] px-2">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active =
            href === "/"
              ? pathname === "/"
              : pathname.startsWith(href.split("/").slice(0, 2).join("/"));
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex h-8 items-center gap-3 rounded-md px-3 text-app-body text-ink-subtle transition-colors duration-150 hover:bg-surface-1 hover:text-ink",
                active &&
                  "bg-sidebar-accent text-ink before:absolute before:top-1 before:bottom-1 before:left-0 before:w-[2px] before:rounded-full before:bg-primary",
              )}
            >
              <Icon aria-hidden className="size-4" />
              {label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
