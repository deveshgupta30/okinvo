import type { AccentId } from "@/lib/accent";
import type { SidebarState } from "@/lib/sidebar";
import type { ThemeMode } from "@/lib/theme";
import { MobileTopbar } from "./mobile-topbar";
import { PreferenceSync } from "./preference-sync";
import { Sidebar } from "./sidebar";
import type { ShellUser } from "./user-menu";

/** Signed-in frame: desktop sidebar or mobile top bar + drawer, and the page area. */
export function AppShell({
  user,
  sidebar,
  theme,
  accent,
  children,
}: {
  user: ShellUser;
  sidebar: SidebarState;
  theme: ThemeMode;
  accent: AccentId;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <PreferenceSync theme={theme} accent={accent} />
      <MobileTopbar user={user} theme={theme} />
      <Sidebar user={user} initial={sidebar} theme={theme} accent={accent} />
      <div className="flex min-w-0 flex-1 flex-col">
        <main className="mx-auto w-full max-w-[1280px] p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
