"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import * as React from "react";
import { PullToRefresh } from "@/components/motion/pull-to-refresh";

/**
 * Pull down on a phone list to re-render it from the server (addendum §3, beui pull to
 * refresh): `router.refresh()` inside a transition, so the indicator spins until the fresh
 * rows have arrived.
 */
export function RefreshableList({ children }: { children: React.ReactNode }) {
  const t = useTranslations("ui.pullToRefresh");
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  return (
    <PullToRefresh
      onRefresh={() => startTransition(() => router.refresh())}
      refreshing={pending}
      ariaLabel={t("label")}
      pullingLabel={t("pulling")}
      releaseLabel={t("release")}
      refreshingLabel={t("refreshing")}
      indicatorClassName="text-app-caption text-ink-subtle"
    >
      {/* Touch only (the spec's "list pages on touch screens"): the block captures a mouse or pen
          pointer for its drag, which would swallow clicks on the row buttons, so those pointers
          stop here and the finger path (native touch listeners) is untouched. */}
      <div
        onPointerDown={(e) => {
          if (e.pointerType !== "touch") e.stopPropagation();
        }}
      >
        {children}
      </div>
    </PullToRefresh>
  );
}
