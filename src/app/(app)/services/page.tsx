import type { Metadata } from "next";
import Link from "next/link";
import { Wrench } from "lucide-react";
import { ConfirmAction } from "@/components/confirm-action";
import { ExportButton } from "@/components/export-button";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Amount } from "@/components/ui/mono";
import { PageHeader } from "@/components/ui/page-header";
import { ActivePill } from "@/components/ui/status-pill";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { formatAmount } from "@/lib/format";
import { UNIT_LABELS } from "@/lib/schemas/service-input";
import {
  archiveServiceAction,
  toggleServiceAction,
  unarchiveServiceAction,
} from "@/server/actions/services";
import { requireOwner } from "@/server/auth";
import { getDefaultProfile } from "@/server/dal/profiles";
import { listServices } from "@/server/dal/services";

export const metadata: Metadata = { title: "Services" };

export default async function ServicesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requireOwner();
  const params = await searchParams;
  const showArchived = params.archived === "1";
  const [services, profile] = await Promise.all([
    listServices(actor, { includeArchived: showArchived }),
    getDefaultProfile(actor),
  ]);
  const locale = profile?.locale ?? "en-IN";
  const returnTo = showArchived ? "/services?archived=1" : "/services";
  return (
    <>
      <PageHeader
        title="Services"
        description="Your catalogue. Picking a service copies its values onto the invoice line."
        actions={
          <>
            <Button asChild variant="tertiary">
              <Link href={showArchived ? "/services" : "/services?archived=1"}>
                {showArchived ? "Hide archived" : "Show archived"}
              </Link>
            </Button>
            <ExportButton dataset="services" params={showArchived ? { archived: "1" } : {}} />
            <Button asChild>
              <Link href="/services/new">New service</Link>
            </Button>
          </>
        }
      />
      {services.length === 0 ? (
        <EmptyState
          icon={Wrench}
          title="No services yet"
          description="Add what you sell — hourly design, a fixed-fee milestone — with its SAC/HSN code and tax rate."
          action={
            <Button asChild variant="secondary">
              <Link href="/services/new">Add a service</Link>
            </Button>
          }
        />
      ) : (
        <Table cards>
          <THead>
            <TR>
              <TH>Name</TH>
              <TH>Unit</TH>
              <TH numeric>Rate</TH>
              <TH>Currency</TH>
              <TH>SAC / HSN</TH>
              <TH numeric>Tax</TH>
              <TH>Status</TH>
              <TH />
            </TR>
          </THead>
          <TBody>
            {services.map((s) => (
              <TR key={s.id}>
                <TD label="Name" className="font-medium">
                  {s.name}
                </TD>
                <TD label="Unit">{UNIT_LABELS[s.unitType]}</TD>
                <TD label="Rate" numeric>
                  <Amount>{formatAmount(s.defaultRate, s.currency, locale)}</Amount>
                </TD>
                <TD label="Currency" mono>
                  {s.currency}
                </TD>
                <TD label="SAC / HSN" mono>
                  {s.sacHsnCode ?? "—"}
                </TD>
                <TD label="Tax" numeric>
                  {s.defaultTaxRate}%
                </TD>
                <TD label="Status">
                  <ActivePill active={s.isActive} archived={Boolean(s.archivedAt)} />
                </TD>
                <TD label="" className="text-right whitespace-nowrap">
                  <div className="flex justify-end gap-1">
                    <Button asChild variant="tertiary" size="sm">
                      <Link href={`/services/${s.id}/edit`}>Edit</Link>
                    </Button>
                    {!s.archivedAt ? (
                      <form action={toggleServiceAction}>
                        <input type="hidden" name="id" value={s.id} />
                        <input
                          type="hidden"
                          name="isActive"
                          value={s.isActive ? "false" : "true"}
                        />
                        <input type="hidden" name="returnTo" value={returnTo} />
                        <Button type="submit" variant="tertiary" size="sm">
                          {s.isActive ? "Deactivate" : "Activate"}
                        </Button>
                      </form>
                    ) : null}
                    {s.archivedAt ? (
                      <ConfirmAction
                        action={unarchiveServiceAction}
                        title={`Restore ${s.name}?`}
                        confirmLabel="Restore"
                        hidden={{ id: s.id, returnTo }}
                        trigger="Restore"
                        triggerVariant="tertiary"
                        size="sm"
                      />
                    ) : (
                      <ConfirmAction
                        action={archiveServiceAction}
                        title={`Archive ${s.name}?`}
                        description="Existing invoice lines keep their copied values."
                        confirmLabel="Archive"
                        hidden={{ id: s.id, returnTo }}
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
