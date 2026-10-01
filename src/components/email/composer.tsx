"use client";

import Link from "next/link";
import { useActionState } from "react";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Mono } from "@/components/ui/mono";
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
              <CardTitle>Message</CardTitle>
              <CardDescription>
                Pre-filled from the issuer profile&apos;s templates. Nothing is sent until you click
                Send.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <FormMessage state={state} />
            <FieldGroup>
              <Field label="To" htmlFor="to" error={errors?.to} hint="Comma-separated" required>
                <Input id="to" name="to" defaultValue={v("to", defaults.to.join(", "))} />
              </Field>
              <Field label="CC" htmlFor="cc" error={errors?.cc}>
                <Input id="cc" name="cc" defaultValue={v("cc", defaults.cc.join(", "))} />
              </Field>
              <Field label="BCC" htmlFor="bcc" error={errors?.bcc}>
                <Input id="bcc" name="bcc" defaultValue={v("bcc", defaults.bcc.join(", "))} />
              </Field>
            </FieldGroup>
            <Field label="Subject" htmlFor="subject" error={errors?.subject} required>
              <Input id="subject" name="subject" defaultValue={v("subject", defaults.subject)} />
            </Field>
            <Field
              label="Body"
              htmlFor="body"
              error={errors?.body}
              hint="Plain text; links become clickable"
              required
            >
              <Textarea id="body" name="body" rows={12} defaultValue={v("body", defaults.body)} />
            </Field>
            <p className="text-app-body text-ink-subtle">
              Attachment: <Mono className="text-ink">{defaults.attachmentName}</Mono> (the stored
              PDF; cannot be changed)
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {defaults.smtpAvailable ? (
                <SubmitButton pendingLabel="Sending…">Send</SubmitButton>
              ) : (
                <Button asChild>
                  <a href={defaults.mailto}>Open in mail app</a>
                </Button>
              )}
              <Button asChild variant="secondary">
                <a href={downloadHref}>Download PDF</a>
              </Button>
              <Button asChild variant="tertiary">
                <Link href={defaults.backHref}>Cancel</Link>
              </Button>
            </div>
            {!defaults.smtpAvailable ? (
              <p className="text-app-caption text-ink-subtle">
                No SMTP server is configured (Settings → Email). Open the draft in your mail app,
                attach the downloaded PDF, then mark it as sent below.
              </p>
            ) : null}
          </CardContent>
        </Card>
      </form>
      {!defaults.smtpAvailable ? (
        <form action={markSentManuallyAction}>
          <input type="hidden" name="kind" value={defaults.kind} />
          <input type="hidden" name="id" value={defaults.id} />
          <Button type="submit" variant="secondary">
            Mark as sent
          </Button>
        </form>
      ) : null}
    </div>
  );
}
