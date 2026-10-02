"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileText, LayoutDashboard, Package, Receipt, Users, Wrench } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/invoices", label: "Invoices", icon: FileText },
  { href: "/credit-notes", label: "Credit notes", icon: Receipt },
  { href: "/clients", label: "Clients", icon: Users },
  { href: "/services", label: "Services", icon: Wrench },
  { href: "/products", label: "Products", icon: Package },
] as const;

export function isActivePath(pathname: string, href: string): boolean {
  return href === "/"
    ? pathname === "/"
    : pathname.startsWith(href.split("/").slice(0, 2).join("/"));
}

/** One navigation row: icon + label, or icon with a tooltip when the rail is collapsed. */
export function NavItem({
  href,
  label,
  icon: Icon,
  active,
  collapsed,
  onNavigate,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number; "aria-hidden"?: boolean }>;
  active: boolean;
  collapsed: boolean;
  onNavigate?: (() => void) | undefined;
}) {
  const link = (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      {...(onNavigate ? { onClick: onNavigate } : {})}
      className={cn(
        "relative flex h-9 items-center gap-3 rounded-md px-3 text-app-body text-ink-subtle transition-colors duration-150 hover:bg-surface-1 hover:text-ink focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
        collapsed && "justify-center px-0",
        active &&
          "bg-sidebar-accent text-ink before:absolute before:top-1 before:bottom-1 before:left-0 before:w-[2px] before:rounded-full before:bg-primary",
      )}
    >
      <Icon aria-hidden className="size-5 shrink-0" strokeWidth={1.5} />
      <span className={cn("truncate", collapsed && "sr-only")}>{label}</span>
    </Link>
  );
  if (!collapsed) return link;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

export function PrimaryNav({
  collapsed,
  onNavigate,
  className,
}: {
  collapsed: boolean;
  onNavigate?: (() => void) | undefined;
  className?: string;
}) {
  const pathname = usePathname();
  return (
    <nav aria-label="Primary" className={cn("flex flex-col gap-[2px]", className)}>
      {NAV.map((item) => (
        <NavItem
          key={item.href}
          {...item}
          active={isActivePath(pathname, item.href)}
          collapsed={collapsed}
          onNavigate={onNavigate}
        />
      ))}
    </nav>
  );
}
