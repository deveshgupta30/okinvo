"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * Posts every screen the person opens, hard load or soft navigation, to the local page-view
 * counter (addendum §2 item 19). Rendered only when ANALYTICS_LOCAL is on; sends the pathname
 * and nothing else, with keepalive so a navigation away does not lose the beat.
 */
export function PageViewBeacon() {
  const pathname = usePathname();
  useEffect(() => {
    void fetch("/api/usage/view", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: pathname }),
      keepalive: true,
    }).catch(() => {});
  }, [pathname]);
  return null;
}
