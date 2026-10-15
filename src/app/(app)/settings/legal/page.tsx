import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { LegalOperatorForm } from "@/components/settings/legal-operator-form";
import { BouncyAccordion } from "@/components/motion/bouncy-accordion";
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
      <BouncyAccordion
        defaultValue="operator"
        classNames={{
          item: "border-hairline bg-surface-1",
          trigger: "text-app-body text-ink",
          title: "text-app-label text-ink",
          content: "text-app-body text-ink",
          description: "text-app-body text-ink",
        }}
        items={[
          {
            id: "operator",
            title: (
              <span className="flex flex-wrap items-center gap-3">
                {t("operator.title")}
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
              </span>
            ),
            description: (
              <div className="flex flex-col gap-4">
                <p className="text-app-caption text-ink-subtle">{t("operator.description")}</p>
                <LegalOperatorForm initial={op} />
              </div>
            ),
          },
          {
            id: "pages",
            title: t("publicPages.title"),
            description: (
              <div className="flex flex-col gap-4">
                <p className="text-app-caption text-ink-subtle">{t("publicPages.description")}</p>
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
              </div>
            ),
          },
        ]}
      />
    </>
  );
}
