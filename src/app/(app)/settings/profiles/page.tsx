import type { Metadata } from "next";
import Link from "next/link";
import { Building2 } from "lucide-react";
import { ConfirmAction } from "@/components/confirm-action";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Pill } from "@/components/ui/status-pill";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import {
  archiveProfileAction,
  setDefaultProfileAction,
  unarchiveProfileAction,
} from "@/server/actions/profiles";
import { requireOwner } from "@/server/auth";
import { listProfiles } from "@/server/dal/profiles";

export const metadata: Metadata = { title: "Issuer profiles" };

export default async function ProfilesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requireOwner();
  const params = await searchParams;
  const showArchived = params.archived === "1";
  const profiles = await listProfiles(actor, { includeArchived: showArchived });
  return (
    <>
      <PageHeader
        title="Issuer profiles"
        description="The legal identities you bill from. The default one pre-fills new invoices."
        actions={
          <>
            <Button asChild variant="tertiary">
              <Link href={showArchived ? "/settings/profiles" : "/settings/profiles?archived=1"}>
                {showArchived ? "Hide archived" : "Show archived"}
              </Link>
            </Button>
            <Button asChild>
              <Link href="/settings/profiles/new">New profile</Link>
            </Button>
          </>
        }
      />
      {profiles.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No issuer profile yet"
          description="Create the identity you invoice from — an individual with a PAN, or your company."
          action={
            <Button asChild variant="secondary">
              <Link href="/settings/profiles/new">Create a profile</Link>
            </Button>
          }
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Label</TH>
              <TH>Legal name</TH>
              <TH>Type</TH>
              <TH>Country</TH>
              <TH>Currency</TH>
              <TH>Regime</TH>
              <TH>Status</TH>
              <TH />
            </TR>
          </THead>
          <TBody>
            {profiles.map((p) => (
              <TR key={p.id}>
                <TD className="font-medium">{p.label}</TD>
                <TD>{p.legalName}</TD>
                <TD>{p.type === "COMPANY" ? "Company" : "Individual"}</TD>
                <TD mono>{p.countryCode}</TD>
                <TD mono>{p.baseCurrency}</TD>
                <TD>{p.defaultTaxRegime.replace("_", " ")}</TD>
                <TD>
                  {p.archivedAt ? (
                    <Pill tone="neutral">Archived</Pill>
                  ) : p.isDefault ? (
                    <Pill tone="success">Default</Pill>
                  ) : null}
                </TD>
                <TD className="text-right whitespace-nowrap">
                  <div className="flex justify-end gap-1">
                    <Button asChild variant="tertiary" size="sm">
                      <Link href={`/settings/profiles/${p.id}/edit`}>Edit</Link>
                    </Button>
                    {!p.archivedAt && !p.isDefault ? (
                      <ConfirmAction
                        action={setDefaultProfileAction}
                        title={`Make ${p.label} the default?`}
                        description="New invoices will start from this profile."
                        confirmLabel="Set default"
                        hidden={{ id: p.id }}
                        trigger="Set default"
                        triggerVariant="tertiary"
                        size="sm"
                      />
                    ) : null}
                    {p.archivedAt ? (
                      <ConfirmAction
                        action={unarchiveProfileAction}
                        title={`Restore ${p.label}?`}
                        confirmLabel="Restore"
                        hidden={{ id: p.id, returnTo: "/settings/profiles?archived=1" }}
                        trigger="Restore"
                        triggerVariant="tertiary"
                        size="sm"
                      />
                    ) : (
                      <ConfirmAction
                        action={archiveProfileAction}
                        title={`Archive ${p.label}?`}
                        description="It disappears from pickers; existing invoices are untouched."
                        confirmLabel="Archive"
                        hidden={{ id: p.id }}
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
