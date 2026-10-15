"use client";

import { Link2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import * as React from "react";
import { useActionState } from "react";
import { ConfirmAction } from "@/components/confirm-action";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { Field, FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { passwordStrength, type PasswordStrength } from "@/lib/security/password-strength";
import { createShareLinkAction, revokeShareLinkAction } from "@/server/actions/share-links";
import type { ShareLinkDto } from "@/server/dal/share-links";

const STRENGTH_KEY = {
  "very weak": "veryWeak",
  weak: "weak",
  fair: "fair",
  good: "good",
  strong: "strong",
} as const satisfies Record<PasswordStrength["label"], string>;

/**
 * "Share" on an issued document (spec §5.6): creates a public link, optionally behind a password
 * (generated passphrase or the owner's own), shows the URL and password once with copy buttons,
 * and lists the existing links with their counts and a revoke action.
 */
export function ShareDialog({
  kind,
  id,
  links,
}: {
  kind: "INVOICE" | "CREDIT_NOTE";
  id: string;
  links: ShareLinkDto[];
}) {
  const t = useTranslations("share.dialog");
  const locale = useLocale();
  const [state, action] = useActionState(createShareLinkAction, null);
  const [protection, setProtection] = React.useState<"none" | "auto" | "manual">("auto");
  const [password, setPassword] = React.useState("");
  const strength = passwordStrength(password);
  const created = state?.ok ? state.created : null;
  const live = links.filter((l) => !l.revokedAt);
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
        <Link2 className="size-4" strokeWidth={1.5} /> {t("trigger")}
      </Button>
      <ResponsiveDialog
        open={open}
        onOpenChange={setOpen}
        title={t("title")}
        description={t("description")}
        className="max-w-lg"
      >
        {created ? (
          <div className="flex flex-col gap-3 rounded-md border border-hairline bg-surface-1 p-3">
            <p role="status" className="text-app-caption text-semantic-success">
              {state?.ok ? state.message : null}
            </p>
            <div className="flex items-center justify-between gap-2">
              <span className="text-app-label text-ink">{t("link")}</span>
              <CopyButton value={created.url} ariaLabel={t("copyLink")} />
            </div>
            <code className="app-mono text-app-caption break-all text-ink select-all">
              {created.url}
            </code>
            {created.password ? (
              <>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-app-label text-ink">{t("password")}</span>
                  <CopyButton value={created.password} ariaLabel={t("copyPassword")} />
                </div>
                <code
                  data-share-password
                  className="app-mono text-app-caption break-all text-ink select-all"
                >
                  {created.password}
                </code>
                <p className="text-app-caption text-ink-subtle">{t("sendSeparately")}</p>
              </>
            ) : null}
          </div>
        ) : null}

        <form action={action} className="flex flex-col gap-4">
          <input type="hidden" name="kind" value={kind} />
          <input type="hidden" name="id" value={id} />
          <FormMessage state={state && !state.ok ? state : null} />
          <FieldGroup>
            <Field label={t("expires")} htmlFor="share-expires">
              <Select id="share-expires" name="expires" defaultValue="30">
                <option value="7">{t("expiry.d7")}</option>
                <option value="30">{t("expiry.d30")}</option>
                <option value="90">{t("expiry.d90")}</option>
                <option value="never">{t("expiry.never")}</option>
              </Select>
            </Field>
            <Field label={t("protection")} htmlFor="share-protection">
              <Select
                id="share-protection"
                name="protection"
                value={protection}
                onChange={(e) => setProtection(e.target.value as typeof protection)}
              >
                <option value="auto">{t("protectionOptions.auto")}</option>
                <option value="manual">{t("protectionOptions.manual")}</option>
                <option value="none">{t("protectionOptions.none")}</option>
              </Select>
            </Field>
            {protection === "manual" ? (
              <Field
                label={t("password")}
                htmlFor="share-password"
                hint={
                  password
                    ? t("strength", { label: t(`strengthLabels.${STRENGTH_KEY[strength.label]}`) })
                    : t("passwordHint")
                }
                error={state && !state.ok ? state.fieldErrors.password : undefined}
                required
              >
                <Input
                  id="share-password"
                  name="password"
                  type="text"
                  autoComplete="off"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="app-mono"
                />
              </Field>
            ) : null}
          </FieldGroup>
          <div className="flex justify-end">
            <SubmitButton pendingLabel={t("creating")}>{t("create")}</SubmitButton>
          </div>
        </form>

        {live.length > 0 ? (
          <div className="flex flex-col gap-2">
            <span className="text-app-label text-ink">{t("activeLinks")}</span>
            <ul className="flex flex-col gap-2">
              {live.map((l) => (
                <li
                  key={l.id}
                  className="flex flex-col gap-1 rounded-md bg-surface-1 px-3 py-2 text-app-caption"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-ink">
                      {l.expiresAt
                        ? t("linkExpires", {
                            kind: l.protected ? t("passwordProtected") : t("openLink"),
                            date: new Date(l.expiresAt).toLocaleDateString(locale),
                          })
                        : t("linkNeverExpires", {
                            kind: l.protected ? t("passwordProtected") : t("openLink"),
                          })}
                    </span>
                    <ConfirmAction
                      action={revokeShareLinkAction}
                      title={t("revoke.title")}
                      description={t("revoke.description")}
                      confirmLabel={t("revoke.label")}
                      hidden={{ linkId: l.id, kind, id }}
                      trigger={t("revoke.label")}
                      triggerVariant="tertiary"
                      size="sm"
                      destructive
                    />
                  </div>
                  <code className="app-mono break-all text-ink-subtle select-all">{l.url}</code>
                  {l.password ? (
                    <span className="text-ink-subtle">
                      {t.rich("linkPassword", {
                        password: l.password,
                        code: (chunks) => (
                          <code className="app-mono text-ink select-all">{chunks}</code>
                        ),
                      })}
                    </span>
                  ) : null}
                  <span className="text-ink-subtle">
                    {t("counts", { views: l.viewCount, downloads: l.downloadCount })}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </ResponsiveDialog>
    </>
  );
}
