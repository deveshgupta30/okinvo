import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("errors.notFound");
  return { title: t("metaTitle") };
}

/** Unknown URL outside the signed-in shell (the shell has its own not-found inside the layout). */
export default async function RootNotFound() {
  const [t, tc] = await Promise.all([
    getTranslations("errors.notFound"),
    getTranslations("common"),
  ]);
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="font-mono text-app-caption text-ink-subtle">404</p>
      <h1 className="text-app-title text-ink">{t("title")}</h1>
      <p className="text-app-body text-ink-subtle">{t("body")}</p>
      <Button asChild variant="secondary">
        <Link href="/">{tc("goToDashboard")}</Link>
      </Button>
    </main>
  );
}
