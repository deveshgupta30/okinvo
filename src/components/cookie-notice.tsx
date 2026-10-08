"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cookieNoticeCookie } from "@/lib/cookie-notice";

/**
 * Bottom bar on first visit (spec §6.3). okinvo sets only strictly necessary cookies, so this is
 * a notice, not a consent choice: one button, one cookie that remembers it was seen.
 */
export function CookieNotice({ initiallyDismissed }: { initiallyDismissed: boolean }) {
  const t = useTranslations("legalChrome.cookieNotice");
  const [dismissed, setDismissed] = useState(initiallyDismissed);
  if (dismissed) return null;
  return (
    <aside
      role="region"
      aria-label={t("label")}
      data-cookie-notice
      className="fixed inset-x-0 bottom-0 z-40 border-t border-hairline bg-surface-2/95 px-4 py-3 backdrop-blur md:px-6"
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <p className="text-app-body text-ink">
          {t("body")}{" "}
          <Link href="/legal/cookies" className="text-link underline-offset-4 hover:underline">
            {t("policy")}
          </Link>
        </p>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => {
            document.cookie = cookieNoticeCookie();
            setDismissed(true);
          }}
        >
          {t("gotIt")}
        </Button>
      </div>
    </aside>
  );
}
