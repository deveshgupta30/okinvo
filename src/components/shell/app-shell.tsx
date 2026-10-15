"use client";

import { useState } from "react";
import { AnimatedSidebarProvider } from "@/components/motion/animated-sidebar";
import type { AccentId } from "@/lib/accent";
import { sidebarCookie, type SidebarState } from "@/lib/sidebar";
import type { ThemeMode } from "@/lib/theme";
import { Dock } from "./dock";
import { MobileTopbar } from "./mobile-topbar";
import { PreferenceSync } from "./preference-sync";
import { Sidebar } from "./sidebar";
import type { ShellUser } from "./user-menu";

/**
 * Signed-in frame on the beui sidebar provider (addendum §3): the desktop rail morphs between
 * 240 px and 64 px (Cmd/Ctrl+B, the header button, state in the `okinvo.sidebar` cookie the
 * server reads for the first paint), phones get a top bar, a navigation sheet and a bottom dock.
 */
export function AppShell({
  user,
  sidebar,
  theme,
  accent,
  minimal = false,
  children,
}: {
  user: ShellUser;
  sidebar: SidebarState;
  theme: ThemeMode;
  accent: AccentId;
  /** Before onboarding: no navigation, only the theme toggle and the user menu (log out). */
  minimal?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(sidebar === "expanded");
  const onOpenChange = (next: boolean) => {
    setOpen(next);
    document.cookie = sidebarCookie(next ? "expanded" : "collapsed");
  };
  return (
    <AnimatedSidebarProvider
      open={open}
      onOpenChange={onOpenChange}
      style={{
        "--sidebar-width": "15rem",
        "--sidebar-width-icon": "4rem",
        "--sidebar-width-mobile": "18rem",
      }}
      className="flex min-h-dvh flex-col md:flex-row"
    >
      <PreferenceSync theme={theme} accent={accent} />
      <MobileTopbar user={user} />
      <Sidebar user={user} theme={theme} minimal={minimal} />
      <div className="flex min-w-0 flex-1 flex-col">
        <main className="mx-auto w-full max-w-[1280px] p-4 pb-24 md:p-6">{children}</main>
      </div>
      {minimal ? null : <Dock />}
    </AnimatedSidebarProvider>
  );
}
