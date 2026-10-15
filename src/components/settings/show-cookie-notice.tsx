"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { clearCookieNoticeCookie } from "@/lib/cookie-notice";

/** Forgets the "seen" cookie and reloads so the notice appears again (spec §6.3). */
export function ShowCookieNoticeAgain() {
  const t = useTranslations("settings.account.privacy");
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
      {t("showNoticeAgain")}
    </Button>
  );
}
