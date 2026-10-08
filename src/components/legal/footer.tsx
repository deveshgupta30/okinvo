import Link from "next/link";
import { getTranslations } from "next-intl/server";

const LINKS = [
  ["/legal/terms", "terms"],
  ["/legal/privacy", "privacy"],
  ["/legal/cookies", "cookies"],
  ["/legal/security", "security"],
] as const;

/** Legal links under the public pages (sign-in, share viewer). */
export async function LegalFooter() {
  const t = await getTranslations("legalChrome.footer");
  return (
    <footer className="mx-auto mt-8 flex w-full max-w-lg flex-wrap justify-center gap-x-4 gap-y-1 px-4 pb-6 text-app-caption text-ink-tertiary">
      {LINKS.map(([href, key]) => (
        <Link key={href} href={href} className="hover:text-ink-subtle">
          {t(key)}
        </Link>
      ))}
    </footer>
  );
}
