import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Mono } from "@/components/ui/mono";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { todayIn } from "@/lib/dates";
import { env } from "@/lib/env";
import { formatDate } from "@/lib/format";
import { requireRole } from "@/server/auth";
import { usageLast30Days } from "@/server/dal/usage";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings.usage");
  return { title: t("metaTitle"), description: t("metaDescription") };
}

export const dynamic = "force-dynamic";

/** Settings > Usage: the local page-view counts of the last 30 days (addendum §2 item 19). */
export default async function UsagePage() {
  const actor = await requireRole("OWNER");
  const t = await getTranslations("settings.usage");
  const rows = env.ANALYTICS_LOCAL ? await usageLast30Days(todayIn("UTC")) : [];
  const total = rows.reduce((sum, r) => sum + r.count, 0);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} description={t("description")} />
      <Card>
        <CardHeader>
          <CardTitle>{t("last30Days")}</CardTitle>
          <CardDescription>
            {env.ANALYTICS_LOCAL ? t("total", { count: total }) : t("off")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="text-app-body text-ink-subtle">{t("empty")}</p>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>{t("columns.day")}</TH>
                  <TH>{t("columns.path")}</TH>
                  <TH className="text-right">{t("columns.views")}</TH>
                </TR>
              </THead>
              <TBody>
                {rows.map((r) => (
                  <TR key={`${r.day}:${r.path}`}>
                    <TD>
                      <Mono>{formatDate(r.day, actor.locale)}</Mono>
                    </TD>
                    <TD>
                      <Mono>{r.path}</Mono>
                    </TD>
                    <TD className="text-right">
                      <Mono>{r.count}</Mono>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
