import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import "./globals.css";
import { THEME_COOKIE, THEME_INIT_SCRIPT, initialTheme, parseThemeMode } from "@/lib/theme";

export const metadata: Metadata = {
  title: { default: "okinvo", template: "%s · okinvo" },
  description: "Self-hosted invoicing for independent professionals",
  robots: { index: false, follow: false },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  const mode = parseThemeMode(cookieStore.get(THEME_COOKIE)?.value);
  const nonce = headerStore.get("x-nonce") ?? undefined;

  return (
    <html lang="en" data-theme={initialTheme(mode)} suppressHydrationWarning>
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
