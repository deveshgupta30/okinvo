import type { Metadata } from "next";
import Link from "next/link";
import { Landmark } from "lucide-react";
import { ConfirmAction } from "@/components/confirm-action";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { ActivePill, Pill } from "@/components/ui/status-pill";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { PAYMENT_METHOD_LABELS } from "@/lib/schemas/payment-method-input";
import {
  archivePaymentMethodAction,
  setDefaultPaymentMethodAction,
  unarchivePaymentMethodAction,
} from "@/server/actions/payment-methods";
import { requireOwner } from "@/server/auth";
import { listPaymentMethods } from "@/server/dal/payment-methods";

export const metadata: Metadata = { title: "Payment methods" };

export default async function PaymentMethodsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requireOwner();
  const params = await searchParams;
  const showArchived = params.archived === "1";
  const methods = await listPaymentMethods(actor, { includeArchived: showArchived });
  return (
    <>
      <PageHeader
        title="Payment methods"
        description="How clients pay you. Details are encrypted and frozen into each invoice at issue."
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
                {showArchived ? "Hide archived" : "Show archived"}
              </Link>
            </Button>
            <Button asChild>
              <Link href="/settings/payment-methods/new">New method</Link>
            </Button>
          </>
        }
      />
      {methods.length === 0 ? (
        <EmptyState
          icon={Landmark}
          title="No payment methods yet"
          description="Add a bank account, UPI ID or wallet so invoices can tell clients where to pay."
          action={
            <Button asChild variant="secondary">
              <Link href="/settings/payment-methods/new">Add a method</Link>
            </Button>
          }
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Name</TH>
              <TH>Type</TH>
              <TH>Currency</TH>
              <TH>Status</TH>
              <TH />
            </TR>
          </THead>
          <TBody>
            {methods.map((m) => (
              <TR key={m.id}>
                <TD className="font-medium">{m.name}</TD>
                <TD>{PAYMENT_METHOD_LABELS[m.type]}</TD>
                <TD mono>{m.currency ?? "—"}</TD>
                <TD>
                  <div className="flex gap-1">
                    {m.isDefault ? <Pill tone="success">Default</Pill> : null}
                    <ActivePill active={m.isActive} archived={Boolean(m.archivedAt)} />
                  </div>
                </TD>
                <TD className="text-right whitespace-nowrap">
                  <div className="flex justify-end gap-1">
                    <Button asChild variant="tertiary" size="sm">
                      <Link href={`/settings/payment-methods/${m.id}/edit`}>Edit</Link>
                    </Button>
                    {!m.archivedAt && !m.isDefault ? (
                      <ConfirmAction
                        action={setDefaultPaymentMethodAction}
                        title={`Make ${m.name} the default?`}
                        confirmLabel="Set default"
                        hidden={{ id: m.id }}
                        trigger="Set default"
                        triggerVariant="tertiary"
                        size="sm"
                      />
                    ) : null}
                    {m.archivedAt ? (
                      <ConfirmAction
                        action={unarchivePaymentMethodAction}
                        title={`Restore ${m.name}?`}
                        confirmLabel="Restore"
                        hidden={{ id: m.id }}
                        trigger="Restore"
                        triggerVariant="tertiary"
                        size="sm"
                      />
                    ) : (
                      <ConfirmAction
                        action={archivePaymentMethodAction}
                        title={`Archive ${m.name}?`}
                        description="Issued invoices keep the snapshot they printed."
                        confirmLabel="Archive"
                        hidden={{ id: m.id }}
                        trigger="Archive"
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
