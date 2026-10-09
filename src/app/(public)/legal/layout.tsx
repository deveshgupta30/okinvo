import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Wordmark } from "@/components/brand/logo";

export const metadata: Metadata = {
  robots: { index: true, follow: true },
};

const NAV = [
  ["/legal/cookies", "cookies"],
  ["/legal/privacy", "privacy"],
  ["/legal/terms", "terms"],
  ["/legal/acceptable-use", "acceptableUse"],
  ["/legal/data-retention", "retention"],
  ["/legal/security", "security"],
  ["/legal/licenses", "licences"],
] as const;

/** Public, printable frame for the legal documents (spec §6.3-6.4). */
export default async function LegalLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations("legalChrome");
  const tc = await getTranslations("common");
  return (
    <main className="min-h-dvh bg-canvas">
      <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 py-6 md:px-6 print:hidden">
        <Link href="/" aria-label={tc("home")} className="text-ink">
          <Wordmark className="h-5" title={tc("appName")} />
        </Link>
        <nav
          aria-label={t("nav.label")}
          className="flex flex-wrap gap-x-4 gap-y-1 text-app-caption"
        >
          {NAV.map(([href, key]) => (
            <Link key={href} href={href} className="text-link underline-offset-4 hover:underline">
              {t(`nav.${key}`)}
            </Link>
          ))}
        </nav>
      </div>
      <div className="px-4 pb-16 md:px-6">{children}</div>
      <footer className="mx-auto w-full max-w-3xl px-4 pb-8 text-app-caption text-ink-tertiary md:px-6 print:hidden">
        {t("operatorNotice")}
      </footer>
    </main>
  );
}
