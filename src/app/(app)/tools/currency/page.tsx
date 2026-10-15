import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { CurrencySwap } from "@/components/tools/currency-swap";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireRole } from "@/server/auth";
import { listProfiles } from "@/server/dal/profiles";
import { currentRates } from "@/server/dal/rates";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("tools.currency");
  return { title: t("metaTitle"), description: t("description") };
}

export const dynamic = "force-dynamic";

/** Tools → Currency (addendum §5): the converter over the table this instance carries. */
export default async function CurrencyToolPage() {
  const actor = await requireRole("VIEWER");
  const [t, table, profiles] = await Promise.all([
    getTranslations("tools.currency"),
    currentRates(),
    listProfiles(actor),
  ]);
  const base = profiles.find((p) => p.isDefault)?.baseCurrency ?? profiles[0]?.baseCurrency;
  const from = base ?? "USD";
  const to = from === "USD" ? "EUR" : "USD";
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} description={t("description")} />
      <Card>
        <CardContent className="flex flex-col gap-4">
          <CurrencySwap table={table} defaultFrom={from} defaultTo={to} locale={actor.locale} />
          <p className="text-app-caption text-ink-subtle">{t("note")}</p>
        </CardContent>
      </Card>
    </div>
  );
}
