import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.error");
  return { title: t("metaTitle") };
}

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [params, t] = await Promise.all([searchParams, getTranslations("auth.error")]);
  const code = typeof params.error === "string" ? params.error : "unknown";
  return (
    <main className="flex min-h-dvh items-center justify-center bg-canvas p-6">
      <section className="w-full max-w-sm rounded-lg border border-hairline bg-surface-1 p-8">
        <h1 className="text-app-title text-ink">{t("title")}</h1>
        <p className="mt-2 text-app-body text-ink-subtle">
          {t.rich("body", {
            code: (chunks) => <code className="font-mono">{chunks}</code>,
            value: code,
          })}
        </p>
        <Link href="/auth/sign-in" className="mt-6 inline-block text-app-body text-link">
          {t("back")}
        </Link>
      </section>
    </main>
  );
}
