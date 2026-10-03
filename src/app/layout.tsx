import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import "./globals.css";
import { CookieNotice } from "@/components/cookie-notice";
import { ACCENT_COOKIE, parseAccent } from "@/lib/accent";
import { COOKIE_NOTICE_COOKIE, isCookieNoticeDismissed } from "@/lib/cookie-notice";
import { THEME_COOKIE, THEME_INIT_SCRIPT, initialTheme, parseThemeMode } from "@/lib/theme";

export const metadata: Metadata = {
  title: { default: "okinvo", template: "%s · okinvo" },
  description: "Self-hosted invoicing for independent professionals",
  robots: { index: false, follow: false },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  const mode = parseThemeMode(cookieStore.get(THEME_COOKIE)?.value);
  const accent = parseAccent(cookieStore.get(ACCENT_COOKIE)?.value);
  const nonce = headerStore.get("x-nonce") ?? undefined;
  const noticeDismissed = isCookieNoticeDismissed(cookieStore.get(COOKIE_NOTICE_COOKIE)?.value);

  return (
    <html lang="en" data-theme={initialTheme(mode)} data-accent={accent} suppressHydrationWarning>
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-dvh">
        {children}
        <CookieNotice initiallyDismissed={noticeDismissed} />
      </body>
    </html>
  );
}
