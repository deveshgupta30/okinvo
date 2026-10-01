import { Suspense } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { FlashFromSearch } from "@/components/flash-from-search";
import { TimezoneDetect } from "@/components/timezone-detect";
import { requireUser } from "@/server/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireUser();
  return (
    <div className="flex min-h-dvh">
      <AppSidebar user={{ name: user.name, email: user.email }} />
      <TimezoneDetect current={user.timezone ?? null} />
      <div className="flex min-w-0 flex-1 flex-col">
        <main className="mx-auto w-full max-w-[1280px] p-6">{children}</main>
      </div>
      <Suspense fallback={null}>
        <FlashFromSearch />
      </Suspense>
    </div>
  );
}
