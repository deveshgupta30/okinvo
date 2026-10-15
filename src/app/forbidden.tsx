import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("errors.forbidden");
  return { title: t("metaTitle") };
}

/** `forbidden()` (experimental.authInterrupts): signed in, but not an owner. */
export default async function Forbidden() {
  const [t, tc] = await Promise.all([
    getTranslations("errors.forbidden"),
    getTranslations("common"),
  ]);
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="font-mono text-app-caption text-ink-subtle">403</p>
      <h1 className="text-app-title text-ink">{t("title")}</h1>
      <p className="text-app-body text-ink-subtle">{t("body")}</p>
      <Button asChild variant="secondary">
        <Link href="/">{tc("goToDashboard")}</Link>
      </Button>
    </main>
  );
}
