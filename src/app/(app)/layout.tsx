import { cookies } from "next/headers";
import { Suspense } from "react";
import { FlashFromSearch } from "@/components/flash-from-search";
import { PageViewBeacon } from "@/components/page-view-beacon";
import { AppShell } from "@/components/shell/app-shell";
import { TimezoneDetect } from "@/components/timezone-detect";
import { parseAccent } from "@/lib/accent";
import { env } from "@/lib/env";
import { SIDEBAR_COOKIE, parseSidebar } from "@/lib/sidebar";
import { parseThemeMode } from "@/lib/theme";
import { optionalUser, requireUser } from "@/server/auth";
import { getAccount } from "@/server/dal/users";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireUser({ allowOnboarding: true });
  const [actor, cookieStore] = await Promise.all([optionalUser(), cookies()]);
  const account = actor ? await getAccount(actor) : null;
  const sidebar = parseSidebar(cookieStore.get(SIDEBAR_COOKIE)?.value);
  return (
    <AppShell
      user={{ name: user.name, email: user.email, avatarKey: account?.avatarKey ?? null }}
      sidebar={sidebar}
      theme={parseThemeMode(account?.theme)}
      accent={parseAccent(account?.accent)}
      minimal={account?.onboardedAt === null}
    >
      <TimezoneDetect current={user.timezone ?? null} />
      {/* Local analytics (addendum §2 item 19): every screen, soft navigations included. */}
      {env.ANALYTICS_LOCAL ? <PageViewBeacon /> : null}
      {children}
      <Suspense fallback={null}>
        <FlashFromSearch />
      </Suspense>
    </AppShell>
  );
}
