import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AccentPicker } from "@/components/settings/accent-picker";
import { ThemeChoice } from "@/components/settings/theme-choice";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireRole } from "@/server/auth";
import { getAccount } from "@/server/dal/users";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings.appearance");
  return { title: t("metaTitle") };
}

export default async function AppearancePage() {
  const actor = await requireRole("VIEWER");
  const [account, t] = await Promise.all([
    getAccount(actor),
    getTranslations("settings.appearance"),
  ]);
  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>{t("theme.title")}</CardTitle>
              <CardDescription>{t("theme.description")}</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <ThemeChoice initial={account.theme} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div>
              <CardTitle>{t("accent.title")}</CardTitle>
              <CardDescription>{t("accent.description")}</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <AccentPicker initial={account.accent} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
