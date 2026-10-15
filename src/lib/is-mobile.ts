"use client";

import { useSyncExternalStore } from "react";

/** The same breakpoint beui's sidebar uses for its phone sheet (Tailwind `md`). */
export const MOBILE_QUERY = "(max-width: 767px)";

function subscribe(onChange: () => void): () => void {
  const mql = window.matchMedia(MOBILE_QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

/** True below `md`; false on the server and until hydration, like the sidebar. */
export function useIsMobile(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(MOBILE_QUERY).matches,
    () => false,
  );
}
