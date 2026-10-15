import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ConfirmAction } from "@/components/confirm-action";
import { EmailDefaultsForm, SmtpForm } from "@/components/email/smtp-form";
import { SentLog } from "@/components/email/sent-log";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Pill } from "@/components/ui/status-pill";
import { clearSmtpAction, sendTestEmailAction } from "@/server/actions/email";
import { requireOwner } from "@/server/auth";
import { listEmailMessages } from "@/server/dal/emails";
import { getSmtpSettings } from "@/server/dal/smtp-settings";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings.email");
  return { title: t("metaTitle") };
}

export default async function EmailSettingsPage() {
  const actor = await requireOwner();
  const t = await getTranslations("settings.email");
  const tc = await getTranslations("common");
  const [settings, log] = await Promise.all([
    getSmtpSettings(actor),
    listEmailMessages(actor, { limit: 50 }),
  ]);
  const status =
    settings.source === "settings"
      ? { tone: "success" as const, label: t("configuredSettings") }
      : settings.source === "env"
        ? { tone: "success" as const, label: t("configuredEnv") }
        : { tone: "warning" as const, label: t("notConfigured") };
  return (
    <>
      <PageHeader
        title={
          <>
            {t("title")} <Pill tone={status.tone}>{status.label}</Pill>
          </>
        }
        description={t("description")}
        actions={
          <>
            {settings.source !== "none" ? (
              <form action={sendTestEmailAction}>
                <Button type="submit" variant="secondary">
                  {t("sendTest", { email: actor.email })}
                </Button>
              </form>
            ) : null}
            {settings.source === "settings" ? (
              <ConfirmAction
                action={clearSmtpAction}
                title={t("removeTitle")}
                description={
                  settings.envConfigured ? t("removeEnvTakesOver") : t("removeFallsBack")
                }
                confirmLabel={tc("remove")}
                trigger={t("removeTrigger")}
                triggerVariant="tertiary"
                destructive
              />
            ) : null}
          </>
        }
      />
      <div className="flex flex-col gap-6">
        <div className="grid gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>{t("smtpTitle")}</CardTitle>
                <CardDescription>
                  {settings.source === "env" && !settings.envConfigured
                    ? ""
                    : settings.source === "env"
                      ? t("smtpFromEnv")
                      : t("smtpPasswordNote")}
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <SmtpForm settings={settings} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <div>
                <CardTitle>{t("defaultsTitle")}</CardTitle>
                <CardDescription>{t("defaultsDescription")}</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <EmailDefaultsForm settings={settings} />
            </CardContent>
          </Card>
        </div>
        <Card>
          <CardHeader>
            <div>
              <CardTitle>{t("sentTitle")}</CardTitle>
              <CardDescription>{t("sentDescription")}</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <SentLog rows={log} timeZone={actor.timezone} showDocument />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
