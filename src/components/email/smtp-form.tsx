"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/submit-button";
import { Field, FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { saveEmailDefaultsAction, saveSmtpAction } from "@/server/actions/email";
import type { SmtpSettingsView } from "@/server/dal/smtp-settings";

export function SmtpForm({ settings }: { settings: SmtpSettingsView }) {
  const t = useTranslations("settings.email.smtp");
  const tc = useTranslations("common");
  const [state, action] = useActionState(saveSmtpAction, null);
  const errors = state?.fieldErrors;
  const stored = settings.source === "settings" ? settings : null;
  const v = (key: string, fallback: string | number | undefined) =>
    state?.values?.[key] ?? (fallback == null ? "" : String(fallback));
  return (
    <form action={action} className="flex flex-col gap-4">
      <FormMessage state={state} />
      <FieldGroup>
        <Field label={t("host")} htmlFor="host" error={errors?.host} required>
          <Input
            id="host"
            name="host"
            className="font-mono"
            defaultValue={v("host", stored?.host ?? settings.host)}
            placeholder="smtp.example.com"
          />
        </Field>
        <Field label={t("port")} htmlFor="port" error={errors?.port} required>
          <Input
            id="port"
            name="port"
            type="number"
            min="1"
            max="65535"
            defaultValue={v("port", stored?.port ?? settings.port ?? 587)}
          />
        </Field>
        <Field label={t("security")} htmlFor="security" error={errors?.security} required>
          <Select
            id="security"
            name="security"
            defaultValue={v("security", stored?.security ?? settings.security ?? "starttls")}
          >
            <option value="starttls">{t("starttls")}</option>
            <option value="tls">{t("tls")}</option>
            <option value="none">{t("none")}</option>
          </Select>
        </Field>
        <Field label={t("user")} htmlFor="user" error={errors?.user}>
          <Input
            id="user"
            name="user"
            autoComplete="off"
            defaultValue={v("user", stored?.user ?? settings.user)}
          />
        </Field>
        <Field
          label={t("password")}
          htmlFor="password"
          error={errors?.password}
          hint={stored?.hasPassword ? t("passwordStored") : t("passwordEncrypted")}
        >
          <Input id="password" name="password" type="password" autoComplete="new-password" />
        </Field>
        <Field label={t("from")} htmlFor="from" error={errors?.from} required>
          <Input
            id="from"
            name="from"
            type="email"
            defaultValue={v("from", stored?.from ?? settings.from)}
          />
        </Field>
        <Field label={t("fromName")} htmlFor="fromName" error={errors?.fromName}>
          <Input
            id="fromName"
            name="fromName"
            defaultValue={v("fromName", stored?.fromName ?? settings.fromName)}
          />
        </Field>
        <Field label={t("replyTo")} htmlFor="replyTo" error={errors?.replyTo}>
          <Input
            id="replyTo"
            name="replyTo"
            type="email"
            defaultValue={v("replyTo", stored?.replyTo ?? settings.replyTo)}
          />
        </Field>
      </FieldGroup>
      <div>
        <SubmitButton pendingLabel={tc("saving")}>{t("save")}</SubmitButton>
      </div>
    </form>
  );
}

export function EmailDefaultsForm({ settings }: { settings: SmtpSettingsView }) {
  const t = useTranslations("settings.email.defaults");
  const tc = useTranslations("common");
  const [state, action] = useActionState(saveEmailDefaultsAction, null);
  const errors = state?.fieldErrors;
  return (
    <form action={action} className="flex flex-col gap-4">
      <FormMessage state={state} />
      <FieldGroup>
        <Field label={t("cc")} htmlFor="cc" error={errors?.cc} hint={t("ccHint")}>
          <Input
            id="cc"
            name="cc"
            defaultValue={state?.values?.cc ?? settings.emailDefaults.cc.join(", ")}
          />
        </Field>
        <Field label={t("bcc")} htmlFor="bcc" error={errors?.bcc}>
          <Input
            id="bcc"
            name="bcc"
            defaultValue={state?.values?.bcc ?? settings.emailDefaults.bcc.join(", ")}
          />
        </Field>
      </FieldGroup>
      <div>
        <SubmitButton variant="secondary" pendingLabel={tc("saving")}>
          {t("save")}
        </SubmitButton>
      </div>
    </form>
  );
}
