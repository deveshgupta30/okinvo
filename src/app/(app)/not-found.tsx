import { getTranslations } from "next-intl/server";
import { NotFoundStacked } from "@/components/motion/not-found/stacked";
import { NOT_FOUND_CLASS } from "@/components/not-found-class";

/** `notFound()` from any signed-in page: beui's stacked 404 inside the shell, sidebar intact. */
export default async function AppNotFound() {
  const [t, tn] = await Promise.all([
    getTranslations("errors.appNotFound"),
    getTranslations("shell.nav"),
  ]);
  return (
    <NotFoundStacked
      title={t("title")}
      description={t("body")}
      homeHref="/"
      homeLabel={t("back")}
      browseHref="/invoices"
      browseLabel={tn("invoices")}
      className={`min-h-[60dvh] ${NOT_FOUND_CLASS}`}
    />
  );
}
