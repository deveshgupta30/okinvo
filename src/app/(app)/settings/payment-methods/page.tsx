import type { Metadata } from "next";
import Link from "next/link";
import { Landmark } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { ConfirmAction } from "@/components/confirm-action";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { ActivePill, Pill } from "@/components/ui/status-pill";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import type { PaymentMethodType } from "@/lib/schemas";
import {
  archivePaymentMethodAction,
  setDefaultPaymentMethodAction,
  unarchivePaymentMethodAction,
} from "@/server/actions/payment-methods";
import { requireOwner } from "@/server/auth";
import { listPaymentMethods } from "@/server/dal/payment-methods";

const TYPE_KEYS = {
  BANK_TRANSFER: "bankTransfer",
  UPI: "upi",
  WISE: "wise",
  REVOLUT: "revolut",
  PAYPAL: "paypal",
  CUSTOM: "custom",
} as const satisfies Record<PaymentMethodType, string>;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings.paymentMethods");
  return { title: t("metaTitle") };
}

export default async function PaymentMethodsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requireOwner();
  const t = await getTranslations("settings.paymentMethods");
  const tc = await getTranslations("common");
  const params = await searchParams;
  const showArchived = params.archived === "1";
  const methods = await listPaymentMethods(actor, { includeArchived: showArchived });
  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <>
            <Button asChild variant="tertiary">
              <Link
                href={
                  showArchived
                    ? "/settings/payment-methods"
                    : "/settings/payment-methods?archived=1"
                }
              >
                {showArchived ? tc("hideArchived") : tc("showArchived")}
              </Link>
            </Button>
            <Button asChild>
              <Link href="/settings/payment-methods/new">{t("newMethod")}</Link>
            </Button>
          </>
        }
      />
      {methods.length === 0 ? (
        <EmptyState
          icon={Landmark}
          title={t("emptyTitle")}
          description={t("emptyDescription")}
          action={
            <Button asChild variant="secondary">
              <Link href="/settings/payment-methods/new">{t("addMethod")}</Link>
            </Button>
          }
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>{t("columns.name")}</TH>
              <TH>{t("columns.type")}</TH>
              <TH>{t("columns.currency")}</TH>
              <TH>{t("columns.status")}</TH>
              <TH />
            </TR>
          </THead>
          <TBody>
            {methods.map((m) => (
              <TR key={m.id}>
                <TD className="font-medium">{m.name}</TD>
                <TD>{t(`types.${TYPE_KEYS[m.type]}`)}</TD>
                <TD mono>{m.currency ?? tc("emptyValue")}</TD>
                <TD>
                  <div className="flex gap-1">
                    {m.isDefault ? <Pill tone="success">{tc("default")}</Pill> : null}
                    <ActivePill active={m.isActive} archived={Boolean(m.archivedAt)} />
                  </div>
                </TD>
                <TD className="text-right whitespace-nowrap">
                  <div className="flex justify-end gap-1">
                    <Button asChild variant="tertiary" size="sm">
                      <Link href={`/settings/payment-methods/${m.id}/edit`}>{tc("edit")}</Link>
                    </Button>
                    {!m.archivedAt && !m.isDefault ? (
                      <ConfirmAction
                        action={setDefaultPaymentMethodAction}
                        title={t("makeDefaultTitle", { name: m.name })}
                        confirmLabel={tc("setDefault")}
                        hidden={{ id: m.id }}
                        trigger={tc("setDefault")}
                        triggerVariant="tertiary"
                        size="sm"
                      />
                    ) : null}
                    {m.archivedAt ? (
                      <ConfirmAction
                        action={unarchivePaymentMethodAction}
                        title={t("restoreTitle", { name: m.name })}
                        confirmLabel={tc("restore")}
                        hidden={{ id: m.id }}
                        trigger={tc("restore")}
                        triggerVariant="tertiary"
                        size="sm"
                      />
                    ) : (
                      <ConfirmAction
                        action={archivePaymentMethodAction}
                        title={t("archiveTitle", { name: m.name })}
                        description={t("archiveDescription")}
                        confirmLabel={tc("archive")}
                        hidden={{ id: m.id }}
                        trigger={tc("archive")}
                        triggerVariant="tertiary"
                        size="sm"
                        destructive
                      />
                    )}
                  </div>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </>
  );
}
