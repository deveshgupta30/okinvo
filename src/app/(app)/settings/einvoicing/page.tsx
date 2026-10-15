import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { EInvoiceSettingsForm } from "@/components/settings/einvoice-settings-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Pill } from "@/components/ui/status-pill";
import { requireOwner } from "@/server/auth";
import { getEInvoiceSettings } from "@/server/dal/einvoice-settings";
import { listProfiles } from "@/server/dal/profiles";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings.einvoicing");
  return { title: t("metaTitle") };
}

/** Settings → E-invoicing (spec §9e): one card per issuer profile. */
export default async function EInvoicingSettingsPage() {
  const actor = await requireOwner();
  const t = await getTranslations("settings.einvoicing");
  const profiles = await listProfiles(actor);
  const settings = await getEInvoiceSettings(
    actor,
    profiles.map((p) => p.id),
  );
  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <div className="flex flex-col gap-6">
        {profiles.length === 0 ? (
          <p className="text-app-body text-ink-subtle">
            <Link
              href="/settings/profiles/new"
              className="text-link underline-offset-4 hover:underline"
            >
              {t("noProfiles")}
            </Link>
          </p>
        ) : null}
        {profiles.map((profile, i) => (
          <Card key={profile.id} data-profile-label={profile.label}>
            <CardHeader>
              <div className="flex flex-wrap items-center gap-3">
                <CardTitle>
                  {t("profile")}: {profile.label}
                </CardTitle>
                <Pill tone={profile.einvoiceEnabled ? "success" : "neutral"}>
                  {profile.einvoiceEnabled ? t("enabled") : t("disabled")}
                </Pill>
              </div>
              <CardDescription>{t("enabledHint")}</CardDescription>
            </CardHeader>
            <CardContent>
              <EInvoiceSettingsForm settings={settings[i] ?? { profileId: profile.id }} />
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
