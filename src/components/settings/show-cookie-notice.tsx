"use client";

import { Button } from "@/components/ui/button";
import { clearCookieNoticeCookie } from "@/lib/cookie-notice";

/** Forgets the "seen" cookie and reloads so the notice appears again (spec §6.3). */
export function ShowCookieNoticeAgain() {
  return (
    <Button
      type="button"
      variant="link"
      size="sm"
      onClick={() => {
        document.cookie = clearCookieNoticeCookie();
        window.location.reload();
      }}
    >
      Show the cookie notice again
    </Button>
  );
}
