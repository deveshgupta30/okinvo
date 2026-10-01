"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { authClient } from "@/lib/auth/client";

/** Stores the browser's IANA zone on the user once, at first sign-in (SPEC §4.1). */
export function TimezoneDetect({ current }: { current: string | null }) {
  const router = useRouter();
  const done = useRef(false);
  useEffect(() => {
    if (current || done.current) return;
    done.current = true;
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!timezone) return;
    void authClient.updateUser({ timezone }).then(() => router.refresh());
  }, [current, router]);
  return null;
}
