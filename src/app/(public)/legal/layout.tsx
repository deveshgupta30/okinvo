import type { Metadata } from "next";
import Link from "next/link";
import { Wordmark } from "@/components/brand/logo";

export const metadata: Metadata = {
  robots: { index: true, follow: true },
};

/** Public, printable frame for the legal documents (spec §6.3–6.4). */
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-dvh bg-canvas">
      <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 py-6 md:px-6 print:hidden">
        <Link href="/" aria-label="okinvo home" className="text-ink">
          <Wordmark className="h-5" title="okinvo" />
        </Link>
        <nav aria-label="Legal" className="flex flex-wrap gap-x-4 gap-y-1 text-app-caption">
          <Link href="/legal/cookies" className="text-link underline-offset-4 hover:underline">
            Cookies
          </Link>
          <Link href="/legal/privacy" className="text-link underline-offset-4 hover:underline">
            Privacy
          </Link>
          <Link href="/legal/terms" className="text-link underline-offset-4 hover:underline">
            Terms
          </Link>
          <Link
            href="/legal/acceptable-use"
            className="text-link underline-offset-4 hover:underline"
          >
            Acceptable use
          </Link>
          <Link
            href="/legal/data-retention"
            className="text-link underline-offset-4 hover:underline"
          >
            Retention
          </Link>
          <Link href="/legal/security" className="text-link underline-offset-4 hover:underline">
            Security
          </Link>
          <Link href="/legal/licenses" className="text-link underline-offset-4 hover:underline">
            Licences
          </Link>
        </nav>
      </div>
      <div className="px-4 pb-16 md:px-6">{children}</div>
      <footer className="mx-auto w-full max-w-3xl px-4 pb-8 text-app-caption text-ink-tertiary md:px-6 print:hidden">
        okinvo is self-hosted software; the operator of this instance is responsible for its use.
      </footer>
    </main>
  );
}
