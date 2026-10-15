import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
import "./globals.css";
import { CookieNotice } from "@/components/cookie-notice";
import { ACCENT_COOKIE, parseAccent } from "@/lib/accent";
import { COOKIE_NOTICE_COOKIE, isCookieNoticeDismissed } from "@/lib/cookie-notice";
import { isRtl } from "@/lib/i18n/languages";
import { publicOrigin } from "@/lib/site";
import { THEME_COOKIE, THEME_INIT_SCRIPT, initialTheme, parseThemeMode } from "@/lib/theme";

const DESCRIPTION = "Self-hosted invoicing for independent professionals and small businesses.";

/**
 * Site-wide metadata (addendum §2 items 6 and 7). Every route inherits the description and the
 * social preview; public routes set their own description, and the legal layout and the
 * sign-in page open themselves to crawlers while everything else stays noindex.
 */
export const metadata: Metadata = {
  metadataBase: new URL(publicOrigin()),
  title: { default: "okinvo", template: "%s · okinvo" },
  description: DESCRIPTION,
  applicationName: "okinvo",
  robots: { index: false, follow: false },
  openGraph: { type: "website", siteName: "okinvo", title: "okinvo", description: DESCRIPTION },
  twitter: { card: "summary_large_image", title: "okinvo", description: DESCRIPTION },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [cookieStore, headerStore, locale] = await Promise.all([cookies(), headers(), getLocale()]);
  const mode = parseThemeMode(cookieStore.get(THEME_COOKIE)?.value);
  const accent = parseAccent(cookieStore.get(ACCENT_COOKIE)?.value);
  const nonce = headerStore.get("x-nonce") ?? undefined;
  const noticeDismissed = isCookieNoticeDismissed(cookieStore.get(COOKIE_NOTICE_COOKIE)?.value);

  return (
    <html
      lang={locale}
      dir={isRtl(locale) ? "rtl" : "ltr"}
      data-theme={initialTheme(mode)}
      data-accent={accent}
      suppressHydrationWarning
    >
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-dvh">
        <NextIntlClientProvider>
          {children}
          <CookieNotice initiallyDismissed={noticeDismissed} />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
