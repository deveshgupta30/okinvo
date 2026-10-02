import type { Metadata } from "next";
import Link from "next/link";
import { Users } from "lucide-react";
import { ExportButton } from "@/components/export-button";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Pill } from "@/components/ui/status-pill";
import { TBody, TD, TH, THead, TR, Table, TableEmpty } from "@/components/ui/table";
import { requireRole } from "@/server/auth";
import { hasRole } from "@/server/dal/authz";
import { listClients } from "@/server/dal/clients";

export const metadata: Metadata = { title: "Clients" };

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requireRole("VIEWER");
  const canEdit = hasRole(actor, "EDITOR");
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q : "";
  const showArchived = params.archived === "1";
  const clients = await listClients(actor, { q, includeArchived: showArchived });
  const toggle = new URLSearchParams();
  if (q) toggle.set("q", q);
  if (!showArchived) toggle.set("archived", "1");
  return (
    <>
      <PageHeader
        title="Clients"
        description="Everyone you bill. Clients with invoices are archived, never deleted."
        actions={
          <>
            <Button asChild variant="tertiary">
              <Link href={`/clients?${toggle.toString()}`}>
                {showArchived ? "Hide archived" : "Show archived"}
              </Link>
            </Button>
            <ExportButton dataset="clients" params={showArchived ? { archived: "1" } : {}} />
            {canEdit ? (
              <Button asChild>
                <Link href="/clients/new">New client</Link>
              </Button>
            ) : null}
          </>
        }
      />
      <form className="mb-4 flex max-w-sm gap-2" role="search">
        {showArchived ? <input type="hidden" name="archived" value="1" /> : null}
        <Input name="q" defaultValue={q} placeholder="Search by name" aria-label="Search clients" />
        <Button type="submit" variant="secondary">
          Search
        </Button>
      </form>
      {clients.length === 0 && !q ? (
        <EmptyState
          icon={Users}
          title="No clients yet"
          description="Add the people and companies you invoice; their currency and payment terms pre-fill each invoice."
          action={
            canEdit ? (
              <Button asChild variant="secondary">
                <Link href="/clients/new">Add a client</Link>
              </Button>
            ) : null
          }
        />
      ) : (
        <Table cards>
          <THead>
            <TR>
              <TH>Name</TH>
              <TH>Contact</TH>
              <TH>Email</TH>
              <TH>Country</TH>
              <TH>Currency</TH>
              <TH numeric>Terms</TH>
              <TH>Status</TH>
            </TR>
          </THead>
          <TBody>
            {clients.length === 0 ? (
              <TableEmpty colSpan={7}>No clients match “{q}”.</TableEmpty>
            ) : (
              clients.map((c) => (
                <TR key={c.id}>
                  <TD label="Name" className="font-medium">
                    <Link href={`/clients/${c.id}`} className="hover:underline">
                      {c.displayName}
                    </Link>
                  </TD>
                  <TD label="Contact">{c.contactPerson ?? "—"}</TD>
                  <TD label="Email">{c.email ?? "—"}</TD>
                  <TD label="Country" mono>
                    {c.countryCode}
                  </TD>
                  <TD label="Currency" mono>
                    {c.currency}
                  </TD>
                  <TD label="Terms" numeric>
                    {c.paymentTermsDays} d
                  </TD>
                  <TD label="Status">
                    {c.archivedAt ? <Pill>Archived</Pill> : <Pill tone="success">Active</Pill>}
                  </TD>
                </TR>
              ))
            )}
          </TBody>
        </Table>
      )}
    </>
  );
}
