"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import { DescriptionList, Item } from "@/components/ui/description-list";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Pill } from "@/components/ui/status-pill";
import { Textarea } from "@/components/ui/textarea";
import { CANCEL_REASONS } from "@/lib/einvoice/gst/connector";
import type { EInvoiceState } from "@/lib/schemas/einvoice-state";
import {
  cancelIrnAction,
  generateIrnAction,
  recordManualIrnAction,
} from "@/server/actions/einvoice";

/** Status → pill tone and its `invoices.detail.einvoice.statuses` key. */
const STATUS = {
  NONE: { tone: "neutral", key: "none" },
  GENERATED: { tone: "neutral", key: "generated" },
  REGISTERED: { tone: "success", key: "registered" },
  CANCELLED: { tone: "warning", key: "cancelled" },
  FAILED: { tone: "danger", key: "failed" },
} as const;

/**
 * Invoice page, e-invoice card (spec §9e): the registration status, the IRN details once
 * registered, and the actions an editor has: register through the NIC connector, paste the
 * portal's response for the manual connector, cancel within 24 hours.
 */
export function EInvoicePanel({
  invoiceId,
  state,
  connector,
  canEdit,
  ackDateLabel,
  cancellable,
}: {
  invoiceId: string;
  state: EInvoiceState;
  connector: "manual" | "nic" | null;
  canEdit: boolean;
  /** The acknowledgement instant already formatted for the viewer. */
  ackDateLabel: string | null;
  /** Inside the IRP's 24-hour window, decided on the server. */
  cancellable: boolean;
}) {
  const t = useTranslations("invoices.detail.einvoice");
  const tc = useTranslations("common");
  const [pasteState, pasteAction] = useActionState(recordManualIrnAction, null);
  const status = STATUS[state.status];
  const registered = state.status === "REGISTERED";
  return (
    <div className="flex flex-col gap-4" data-einvoice-panel>
      <div className="flex flex-wrap items-center gap-3">
        <Pill tone={status.tone}>{t(`statuses.${status.key}`)}</Pill>
        {connector ? (
          <span className="text-app-caption text-ink-subtle">
            {t("connector")}: {t(`connectors.${connector}`)}
          </span>
        ) : (
          <span className="text-app-caption text-ink-subtle">{t("notConfigured")}</span>
        )}
      </div>
      {state.irn ? (
        <DescriptionList>
          <Item label={t("irn")} mono>
            <span className="break-all">{state.irn}</span>
          </Item>
          {state.ackNo ? (
            <Item label={t("ackNo")} mono>
              {state.ackNo}
            </Item>
          ) : null}
          {ackDateLabel ? (
            <Item label={t("ackDate")} mono>
              {ackDateLabel}
            </Item>
          ) : null}
          {state.cancelReason ? <Item label={t("cancelReason")}>{state.cancelReason}</Item> : null}
        </DescriptionList>
      ) : null}
      {state.status === "FAILED" && state.lastError ? (
        <p className="text-app-body text-semantic-danger">{state.lastError}</p>
      ) : null}
      {canEdit && !registered && state.status !== "CANCELLED" && connector === "nic" ? (
        <form action={generateIrnAction}>
          <input type="hidden" name="id" value={invoiceId} />
          <Button type="submit" variant="primary">
            {t("generate")}
          </Button>
        </form>
      ) : null}
      {canEdit && !registered && state.status !== "CANCELLED" && connector === "manual" ? (
        <form action={pasteAction} className="flex flex-col gap-3">
          <input type="hidden" name="id" value={invoiceId} />
          <FormMessage state={pasteState} />
          <Field
            label={t("pasteLabel")}
            htmlFor="response"
            hint={t("pasteHint")}
            error={pasteState?.fieldErrors?.response}
          >
            <Textarea id="response" name="response" rows={6} className="font-mono" />
          </Field>
          <div>
            <SubmitButton>{t("record")}</SubmitButton>
          </div>
        </form>
      ) : null}
      {canEdit && cancellable ? (
        <form
          action={cancelIrnAction}
          className="flex flex-col gap-3 border-t border-hairline pt-4"
        >
          <input type="hidden" name="id" value={invoiceId} />
          <Field label={t("cancelReasonLabel")} htmlFor="reasonCode" required>
            <Select id="reasonCode" name="reasonCode" defaultValue="2">
              {(Object.keys(CANCEL_REASONS) as (keyof typeof CANCEL_REASONS)[]).map((code) => (
                <option key={code} value={code}>
                  {t(`cancelReasons.${code}`)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={tc("reason")} htmlFor="reason">
            <Input id="reason" name="reason" maxLength={100} />
          </Field>
          <div>
            <Button type="submit" variant="tertiary">
              {t("cancel")}
            </Button>
          </div>
          <p className="text-app-caption text-ink-subtle">{t("cancelWindow")}</p>
        </form>
      ) : null}
    </div>
  );
}
