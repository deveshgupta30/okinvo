"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/submit-button";
import { Field, FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { NIC_BASE_URLS } from "@/lib/schemas/einvoice-settings";
import { saveEInvoiceSettingsAction } from "@/server/actions/einvoice";
import type { EInvoiceProfileSettingsView } from "@/server/dal/einvoice-settings";

/**
 * Settings → E-invoicing (spec §9e), one form per issuer profile: the Indian connector with its
 * NIC credentials (write-only; a stored secret reads as "stored") and the European profile.
 */
export function EInvoiceSettingsForm({ settings }: { settings: EInvoiceProfileSettingsView }) {
  const t = useTranslations("settings.einvoicing");
  const [state, action] = useActionState(saveEInvoiceSettingsAction, null);
  const errors = state && !state.ok ? state.fieldErrors : undefined;
  const values = state && !state.ok ? state.values : undefined;
  const nic = settings.india?.nic;
  const [connector, setConnector] = useState<string>(
    values?.indiaConnector ?? settings.india?.connector ?? "",
  );
  const [env, setEnv] = useState<string>(values?.nicEnv ?? nic?.env ?? "sandbox");
  const v = (key: string, fallback: string | undefined) => values?.[key] ?? fallback ?? "";
  return (
    <form action={action} className="flex flex-col gap-6">
      <input type="hidden" name="profileId" value={settings.profileId} />
      <FormMessage state={state && !state.ok ? state : null} />
      {state?.ok ? (
        <p role="status" className="text-app-body text-semantic-success">
          {state.message}
        </p>
      ) : null}

      <fieldset className="flex flex-col gap-4">
        <legend className="text-app-label text-ink">{t("india.title")}</legend>
        <p className="text-app-caption text-ink-subtle">{t("india.description")}</p>
        <FieldGroup>
          <Field
            label={t("india.connector")}
            htmlFor="indiaConnector"
            error={errors?.indiaConnector}
          >
            <Select
              id="indiaConnector"
              name="indiaConnector"
              value={connector}
              onChange={(e) => setConnector(e.target.value)}
            >
              <option value="">{t("india.connectorNone")}</option>
              <option value="manual">{t("india.connectorManual")}</option>
              <option value="nic">{t("india.connectorNic")}</option>
            </Select>
          </Field>
        </FieldGroup>
        {connector === "nic" ? (
          <>
            <p className="text-app-caption text-semantic-warning">{t("india.nicUnverified")}</p>
            <FieldGroup>
              <Field label={t("india.env")} htmlFor="nicEnv" error={errors?.nicEnv} required>
                <Select
                  id="nicEnv"
                  name="nicEnv"
                  value={env}
                  onChange={(e) => setEnv(e.target.value)}
                >
                  <option value="sandbox">{t("india.sandbox")}</option>
                  <option value="production">{t("india.production")}</option>
                </Select>
              </Field>
              <Field
                label={t("india.baseUrl")}
                htmlFor="nicBaseUrl"
                error={errors?.nicBaseUrl}
                hint={t("india.baseUrlHint")}
              >
                <Input
                  id="nicBaseUrl"
                  name="nicBaseUrl"
                  className="font-mono"
                  placeholder={NIC_BASE_URLS[env === "production" ? "production" : "sandbox"]}
                  defaultValue={v("nicBaseUrl", nic?.baseUrl)}
                />
              </Field>
              <Field label={t("india.gstin")} htmlFor="nicGstin" error={errors?.nicGstin} required>
                <Input
                  id="nicGstin"
                  name="nicGstin"
                  className="font-mono uppercase"
                  defaultValue={v("nicGstin", nic?.gstin)}
                />
              </Field>
              <Field
                label={t("india.clientId")}
                htmlFor="nicClientId"
                error={errors?.nicClientId}
                required
              >
                <Input
                  id="nicClientId"
                  name="nicClientId"
                  autoComplete="off"
                  defaultValue={v("nicClientId", nic?.clientId)}
                />
              </Field>
              <Field
                label={t("india.clientSecret")}
                htmlFor="nicClientSecret"
                error={errors?.nicClientSecret}
                hint={nic?.hasClientSecret ? t("india.secretStored") : t("india.secretEncrypted")}
              >
                <Input
                  id="nicClientSecret"
                  name="nicClientSecret"
                  type="password"
                  autoComplete="new-password"
                />
              </Field>
              <Field
                label={t("india.username")}
                htmlFor="nicUsername"
                error={errors?.nicUsername}
                required
              >
                <Input
                  id="nicUsername"
                  name="nicUsername"
                  autoComplete="off"
                  defaultValue={v("nicUsername", nic?.username)}
                />
              </Field>
              <Field
                label={t("india.publicKey")}
                htmlFor="nicPublicKeyPem"
                error={errors?.nicPublicKeyPem}
                hint={nic?.hasPublicKey ? t("india.publicKeyStored") : t("india.publicKeyHint")}
              >
                <Textarea
                  id="nicPublicKeyPem"
                  name="nicPublicKeyPem"
                  rows={4}
                  className="font-mono"
                />
              </Field>
              <Field
                label={t("india.password")}
                htmlFor="nicPassword"
                error={errors?.nicPassword}
                hint={nic?.hasPassword ? t("india.secretStored") : t("india.secretEncrypted")}
              >
                <Input
                  id="nicPassword"
                  name="nicPassword"
                  type="password"
                  autoComplete="new-password"
                />
              </Field>
            </FieldGroup>
          </>
        ) : null}
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="text-app-label text-ink">{t("eu.title")}</legend>
        <p className="text-app-caption text-ink-subtle">{t("eu.description")}</p>
        <FieldGroup>
          <Field label={t("eu.profile")} htmlFor="euProfile" error={errors?.euProfile}>
            <Select
              id="euProfile"
              name="euProfile"
              defaultValue={v("euProfile", settings.eu?.profile)}
            >
              <option value="">{t("eu.profileNone")}</option>
              <option value="EN16931">{t("eu.en16931")}</option>
            </Select>
          </Field>
        </FieldGroup>
      </fieldset>

      <div>
        <SubmitButton>{t("save")}</SubmitButton>
      </div>
    </form>
  );
}
