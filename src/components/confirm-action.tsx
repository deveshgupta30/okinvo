"use client";

import { useTranslations } from "next-intl";
import * as React from "react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { SubmitButton } from "@/components/submit-button";

/**
 * A button that asks for confirmation (and optionally a reason) before posting hidden fields to a
 * server action. Destructive confirms use the danger fill (v2 §24.6).
 */
export function ConfirmAction({
  action,
  title,
  description,
  confirmLabel,
  hidden = {},
  reason,
  destructive,
  trigger,
  triggerVariant = "secondary",
  size,
}: {
  action: (formData: FormData) => void | Promise<void>;
  title: string;
  description?: string;
  confirmLabel: string;
  hidden?: Record<string, string>;
  reason?: { label: string; required?: boolean; name?: string };
  destructive?: boolean;
  trigger: React.ReactNode;
  triggerVariant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
}) {
  const tc = useTranslations("common");
  const t = useTranslations("ui.confirm");
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button variant={triggerVariant} size={size} type="button" onClick={() => setOpen(true)}>
        {trigger}
      </Button>
      <ResponsiveDialog open={open} onOpenChange={setOpen} title={title} description={description}>
        <form action={action} className="flex flex-col gap-4">
          {Object.entries(hidden).map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
          {reason ? (
            <Field label={reason.label} htmlFor="confirm-reason" required={reason.required}>
              <Textarea
                id="confirm-reason"
                name={reason.name ?? "reason"}
                required={reason.required}
                maxLength={500}
              />
            </Field>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="tertiary" onClick={() => setOpen(false)}>
              {tc("cancel")}
            </Button>
            <SubmitButton
              variant={destructive ? "destructive" : "primary"}
              pendingLabel={t("working")}
            >
              {confirmLabel}
            </SubmitButton>
          </DialogFooter>
        </form>
      </ResponsiveDialog>
    </>
  );
}
