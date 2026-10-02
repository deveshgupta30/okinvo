"use client";

import Link from "next/link";
import { ChevronsUpDown, LogOut, UserRound } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { signOutAction } from "@/server/actions/auth";

export interface ShellUser {
  name: string;
  email: string;
  avatarKey: string | null;
}

/** Sidebar footer user block (spec §3.3): avatar + name, opening Profile and Log out. */
export function UserMenu({
  user,
  collapsed,
  side = "right",
}: {
  user: ShellUser;
  collapsed: boolean;
  side?: "right" | "top";
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Account menu for ${user.name || user.email}`}
          className={cn(
            "flex w-full items-center gap-3 rounded-md p-1.5 text-left transition-colors duration-150 hover:bg-surface-1 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
            collapsed && "justify-center",
          )}
        >
          <Avatar name={user.name} email={user.email} src={user.avatarKey} size="sm" />
          {collapsed ? null : (
            <>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-app-label text-ink">{user.name}</span>
                <span className="block truncate text-app-caption text-ink-subtle">
                  {user.email}
                </span>
              </span>
              <ChevronsUpDown aria-hidden className="size-4 shrink-0 text-ink-tertiary" />
            </>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side={side} align="end" className="w-56">
        <DropdownMenuLabel className="truncate">{user.email}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings/account">
            <UserRound aria-hidden strokeWidth={1.5} />
            Profile
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <form action={signOutAction}>
          <DropdownMenuItem asChild>
            <button type="submit" className="w-full">
              <LogOut aria-hidden strokeWidth={1.5} />
              Log out
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
