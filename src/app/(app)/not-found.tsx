import Link from "next/link";
import { SearchX } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

/** `notFound()` from any signed-in page: rendered inside the shell, sidebar intact. */
export default async function AppNotFound() {
  const t = await getTranslations("errors.appNotFound");
  return (
    <EmptyState
      icon={SearchX}
      title={t("title")}
      description={t("body")}
      action={
        <Button asChild variant="secondary">
          <Link href="/">{t("back")}</Link>
        </Button>
      }
    />
  );
}
