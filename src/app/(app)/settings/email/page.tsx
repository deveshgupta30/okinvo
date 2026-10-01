import type { Metadata } from "next";
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

export const metadata: Metadata = { title: "Email" };

export default async function EmailSettingsPage() {
  const actor = await requireOwner();
  const [settings, log] = await Promise.all([
    getSmtpSettings(actor),
    listEmailMessages(actor, { limit: 50 }),
  ]);
  const status =
    settings.source === "settings"
      ? { tone: "success" as const, label: "Configured in Settings" }
      : settings.source === "env"
        ? { tone: "success" as const, label: "Configured by environment" }
        : { tone: "warning" as const, label: "Not configured — mail-app flow" };
  return (
    <>
      <PageHeader
        title={
          <>
            Email <Pill tone={status.tone}>{status.label}</Pill>
          </>
        }
        description="Documents are sent from the composer with the stored PDF attached. Settings here override SMTP_* in the environment."
        actions={
          <>
            {settings.source !== "none" ? (
              <form action={sendTestEmailAction}>
                <Button type="submit" variant="secondary">
                  Send test email to {actor.email}
                </Button>
              </form>
            ) : null}
            {settings.source === "settings" ? (
              <ConfirmAction
                action={clearSmtpAction}
                title="Remove the stored SMTP settings?"
                description={
                  settings.envConfigured
                    ? "The environment's SMTP_* values take over."
                    : "Email falls back to the mail-app flow."
                }
                confirmLabel="Remove"
                trigger="Remove stored settings"
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
                <CardTitle>SMTP server</CardTitle>
                <CardDescription>
                  {settings.source === "env" && !settings.envConfigured
                    ? ""
                    : settings.source === "env"
                      ? "Currently taken from the environment; saving here overrides it."
                      : "The password is encrypted at rest and never shown again."}
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
                <CardTitle>Default recipients</CardTitle>
                <CardDescription>
                  Instance-wide CC/BCC; issuer profiles add their own.
                </CardDescription>
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
              <CardTitle>Sent mail</CardTitle>
              <CardDescription>
                The last 50 attempts, including failures and manual sends.
              </CardDescription>
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
