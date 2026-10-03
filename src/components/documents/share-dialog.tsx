"use client";

import { Check, Copy, Link2 } from "lucide-react";
import * as React from "react";
import { useActionState } from "react";
import { ConfirmAction } from "@/components/confirm-action";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { passwordStrength } from "@/lib/security/password-strength";
import { createShareLinkAction, revokeShareLinkAction } from "@/server/actions/share-links";
import type { ShareLinkDto } from "@/server/dal/share-links";

function CopyButton({ value, label }: { value: string; label: string }) {
  const [done, setDone] = React.useState(false);
  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      aria-label={label}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          // clipboard unavailable (insecure context): the value is selectable below
        }
      }}
    >
      {done ? (
        <Check className="size-3.5" strokeWidth={1.5} />
      ) : (
        <Copy className="size-3.5" strokeWidth={1.5} />
      )}
      {done ? "Copied" : "Copy"}
    </Button>
  );
}

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
  const [state, action] = useActionState(createShareLinkAction, null);
  const [protection, setProtection] = React.useState<"none" | "auto" | "manual">("auto");
  const [password, setPassword] = React.useState("");
  const strength = passwordStrength(password);
  const created = state?.ok ? state.created : null;
  const live = links.filter((l) => !l.revokedAt);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="secondary">
          <Link2 className="size-4" strokeWidth={1.5} /> Share
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogTitle>Share this document</DialogTitle>
        <DialogDescription>
          Anyone with the link can view and download it until it expires or you revoke it. A
          password also protects the PDF itself: it opens with the password and can be read and
          printed, not edited or copied.
        </DialogDescription>

        {created ? (
          <div className="flex flex-col gap-3 rounded-md border border-hairline bg-surface-1 p-3">
            <p role="status" className="text-app-caption text-semantic-success">
              {state?.ok ? state.message : null}
            </p>
            <div className="flex items-center justify-between gap-2">
              <span className="text-app-label text-ink">Link</span>
              <CopyButton value={created.url} label="Copy link" />
            </div>
            <code className="app-mono text-app-caption break-all text-ink select-all">
              {created.url}
            </code>
            {created.password ? (
              <>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-app-label text-ink">Password</span>
                  <CopyButton value={created.password} label="Copy password" />
                </div>
                <code
                  data-share-password
                  className="app-mono text-app-caption break-all text-ink select-all"
                >
                  {created.password}
                </code>
                <p className="text-app-caption text-ink-subtle">
                  Send the password separately from the link. You can see it again in the list
                  below.
                </p>
              </>
            ) : null}
          </div>
        ) : null}

        <form action={action} className="flex flex-col gap-4">
          <input type="hidden" name="kind" value={kind} />
          <input type="hidden" name="id" value={id} />
          <FormMessage state={state && !state.ok ? state : null} />
          <FieldGroup>
            <Field label="Expires" htmlFor="share-expires">
              <Select id="share-expires" name="expires" defaultValue="30">
                <option value="7">In 7 days</option>
                <option value="30">In 30 days</option>
                <option value="90">In 90 days</option>
                <option value="never">Never</option>
              </Select>
            </Field>
            <Field label="Protection" htmlFor="share-protection">
              <Select
                id="share-protection"
                name="protection"
                value={protection}
                onChange={(e) => setProtection(e.target.value as typeof protection)}
              >
                <option value="auto">Password: generate a passphrase</option>
                <option value="manual">Password: choose my own</option>
                <option value="none">No password (open link)</option>
              </Select>
            </Field>
            {protection === "manual" ? (
              <Field
                label="Password"
                htmlFor="share-password"
                hint={password ? `Strength: ${strength.label}` : "At least 8 characters."}
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
            <SubmitButton pendingLabel="Creating…">Create link</SubmitButton>
          </div>
        </form>

        {live.length > 0 ? (
          <div className="flex flex-col gap-2">
            <span className="text-app-label text-ink">Active links</span>
            <ul className="flex flex-col gap-2">
              {live.map((l) => (
                <li
                  key={l.id}
                  className="flex flex-col gap-1 rounded-md bg-surface-1 px-3 py-2 text-app-caption"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-ink">
                      {l.protected ? "Password-protected" : "Open link"}
                      {l.expiresAt
                        ? ` · expires ${new Date(l.expiresAt).toLocaleDateString("en-GB")}`
                        : " · never expires"}
                    </span>
                    <ConfirmAction
                      action={revokeShareLinkAction}
                      title="Revoke this link?"
                      description="The link stops working immediately for everyone who has it."
                      confirmLabel="Revoke"
                      hidden={{ linkId: l.id, kind, id }}
                      trigger="Revoke"
                      triggerVariant="tertiary"
                      size="sm"
                      destructive
                    />
                  </div>
                  <code className="app-mono break-all text-ink-subtle select-all">{l.url}</code>
                  {l.password ? (
                    <span className="text-ink-subtle">
                      Password: <code className="app-mono text-ink select-all">{l.password}</code>
                    </span>
                  ) : null}
                  <span className="text-ink-subtle">
                    {l.viewCount} views · {l.downloadCount} downloads
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
