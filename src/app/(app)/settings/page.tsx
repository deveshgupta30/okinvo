import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings.nav");
  return { title: t("label") };
}

/** `/settings` has no content of its own; the first tab is the issuer profiles. */
export default function SettingsIndexPage(): never {
  redirect("/settings/profiles");
}
