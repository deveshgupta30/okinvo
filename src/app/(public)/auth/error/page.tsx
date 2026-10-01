import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Sign-in error" };

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const code = typeof params.error === "string" ? params.error : "unknown";
  return (
    <main className="flex min-h-dvh items-center justify-center bg-canvas p-6">
      <section className="w-full max-w-sm rounded-lg border border-hairline bg-surface-1 p-8">
        <h1 className="text-app-title text-ink">Sign-in failed</h1>
        <p className="mt-2 text-app-body text-ink-subtle">
          The identity provider returned <code className="font-mono">{code}</code>. If your address
          is not on this instance&apos;s allow-list, ask the owner to add it.
        </p>
        <Link href="/auth/sign-in" className="mt-6 inline-block text-app-body text-link">
          Back to sign-in
        </Link>
      </section>
    </main>
  );
}
