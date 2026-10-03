import Link from "next/link";

const LINKS = [
  ["/legal/terms", "Terms"],
  ["/legal/privacy", "Privacy"],
  ["/legal/cookies", "Cookies"],
  ["/legal/security", "Security"],
] as const;

/** Legal links under the public pages (sign-in, share viewer). */
export function LegalFooter() {
  return (
    <footer className="mx-auto mt-8 flex w-full max-w-lg flex-wrap justify-center gap-x-4 gap-y-1 px-4 pb-6 text-app-caption text-ink-tertiary">
      {LINKS.map(([href, label]) => (
        <Link key={href} href={href} className="hover:text-ink-subtle">
          {label}
        </Link>
      ))}
    </footer>
  );
}
