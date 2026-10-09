import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { LegalOperatorForm } from "@/components/settings/legal-operator-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Pill } from "@/components/ui/status-pill";
import { missingLegalFields } from "@/lib/schemas/legal-operator";
import { requireOwner } from "@/server/auth";
import { getLegalOperator } from "@/server/dal/legal";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings.legal");
  return { title: t("metaTitle"), description: t("metaDescription") };
}

/** Public legal page and the catalogue key of its title under `publicPages`. */
const PAGES = [
  ["/legal/terms", "terms"],
  ["/legal/acceptable-use", "acceptableUse"],
  ["/legal/privacy", "privacy"],
  ["/legal/cookies", "cookies"],
  ["/legal/data-retention", "dataRetention"],
  ["/legal/security", "security"],
  ["/legal/licenses", "licenses"],
] as const;

export default async function LegalSettingsPage() {
  await requireOwner();
  const t = await getTranslations("settings.legal");
  const op = await getLegalOperator();
  const missing = missingLegalFields(op);
  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center gap-3">
              <CardTitle>{t("operator.title")}</CardTitle>
              {missing.length === 0 ? (
                <Pill tone="success">{t("operator.complete")}</Pill>
              ) : (
                <Pill tone="warning">
                  {t("operator.missing", {
                    count: missing.length,
                    fields: missing.map((m) => t(`fieldLabels.${m}`)).join(", "),
                  })}
                </Pill>
              )}
            </div>
            <CardDescription>{t("operator.description")}</CardDescription>
          </CardHeader>
          <CardContent>
            <LegalOperatorForm initial={op} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div>
              <CardTitle>{t("publicPages.title")}</CardTitle>
              <CardDescription>{t("publicPages.description")}</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-2 sm:grid-cols-2">
              {PAGES.map(([href, key]) => (
                <li key={href}>
                  <Link href={href} className="text-link underline-offset-4 hover:underline">
                    {t(`publicPages.${key}`)}
                  </Link>{" "}
                  <span className="app-mono text-app-caption text-ink-tertiary">{href}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
