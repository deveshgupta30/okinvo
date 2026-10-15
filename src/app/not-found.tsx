import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { NotFoundStacked } from "@/components/motion/not-found/stacked";
import { NOT_FOUND_CLASS } from "@/components/not-found-class";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("errors.notFound");
  return { title: t("metaTitle") };
}

/**
 * Unknown URL outside the signed-in shell (the shell has its own not-found inside the layout):
 * beui's stacked-cards 404 block (addendum §3) with translated copy.
 */
export default async function RootNotFound() {
  const [t, tc, tn] = await Promise.all([
    getTranslations("errors.notFound"),
    getTranslations("common"),
    getTranslations("shell.nav"),
  ]);
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col items-center justify-center p-6">
      <NotFoundStacked
        title={t("title")}
        description={t("body")}
        homeHref="/"
        homeLabel={tc("goToDashboard")}
        browseHref="/invoices"
        browseLabel={tn("invoices")}
        className={NOT_FOUND_CLASS}
      />
    </main>
  );
}
