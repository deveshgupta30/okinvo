"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Mono } from "@/components/ui/mono";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { markSentManuallyAction, sendEmailAction } from "@/server/actions/email";
import type { ComposerDefaults } from "@/server/dal/emails";

export function EmailComposer({
  defaults,
  downloadHref,
}: {
  defaults: ComposerDefaults;
  downloadHref: string;
}) {
  const t = useTranslations("email.composer");
  const tc = useTranslations("common");
  const [state, action] = useActionState(
    sendEmailAction.bind(null, defaults.kind, defaults.id),
    null,
  );
  const errors = state?.fieldErrors;
  const v = (key: string, fallback: string) => state?.values?.[key] ?? fallback;
  return (
    <div className="flex flex-col gap-6">
      <form action={action}>
        <Card>
          <CardHeader>
            <div>
              <CardTitle>{t("title")}</CardTitle>
              <CardDescription>{t("description")}</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <FormMessage state={state} />
            <FieldGroup>
              <Field label={t("to")} htmlFor="to" error={errors?.to} hint={t("toHint")} required>
                <Input id="to" name="to" defaultValue={v("to", defaults.to.join(", "))} />
              </Field>
              <Field label={t("cc")} htmlFor="cc" error={errors?.cc}>
                <Input id="cc" name="cc" defaultValue={v("cc", defaults.cc.join(", "))} />
              </Field>
              <Field label={t("bcc")} htmlFor="bcc" error={errors?.bcc}>
                <Input id="bcc" name="bcc" defaultValue={v("bcc", defaults.bcc.join(", "))} />
              </Field>
            </FieldGroup>
            <Field label={t("subject")} htmlFor="subject" error={errors?.subject} required>
              <Input id="subject" name="subject" defaultValue={v("subject", defaults.subject)} />
            </Field>
            <Field
              label={t("body")}
              htmlFor="body"
              error={errors?.body}
              hint={t("bodyHint")}
              required
            >
              <Textarea id="body" name="body" rows={12} defaultValue={v("body", defaults.body)} />
            </Field>
            <Field
              label={t("attachment")}
              htmlFor="attachment"
              hint={t.rich("attachmentHint", {
                name: defaults.attachmentName,
                mono: (chunks) => <Mono className="text-ink">{chunks}</Mono>,
              })}
            >
              <Select id="attachment" name="attachment" defaultValue={v("attachment", "pdf")}>
                <option value="pdf">{t("pdf")}</option>
                <option value="docx">{t("docx")}</option>
              </Select>
            </Field>
            <div className="flex flex-wrap items-center gap-2">
              {defaults.smtpAvailable ? (
                <SubmitButton pendingLabel={t("sending")}>{t("send")}</SubmitButton>
              ) : (
                <Button asChild>
                  <a href={defaults.mailto}>{t("openInMailApp")}</a>
                </Button>
              )}
              <Button asChild variant="secondary">
                <a href={downloadHref}>{tc("downloadPdf")}</a>
              </Button>
              <Button asChild variant="tertiary">
                <Link href={defaults.backHref}>{tc("cancel")}</Link>
              </Button>
            </div>
            {!defaults.smtpAvailable ? (
              <p className="text-app-caption text-ink-subtle">{t("noSmtp")}</p>
            ) : null}
          </CardContent>
        </Card>
      </form>
      {!defaults.smtpAvailable ? (
        <form action={markSentManuallyAction}>
          <input type="hidden" name="kind" value={defaults.kind} />
          <input type="hidden" name="id" value={defaults.id} />
          <Button type="submit" variant="secondary">
            {t("markAsSent")}
          </Button>
        </form>
      ) : null}
    </div>
  );
}
