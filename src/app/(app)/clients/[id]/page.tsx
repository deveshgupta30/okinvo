import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ConfirmAction } from "@/components/confirm-action";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DescriptionList, Item } from "@/components/ui/description-list";
import { PageHeader } from "@/components/ui/page-header";
import { Pill } from "@/components/ui/status-pill";
import { formatAddressLines } from "@/lib/schemas";
import {
  archiveClientAction,
  deleteClientAction,
  unarchiveClientAction,
} from "@/server/actions/clients";
import { requireOwner } from "@/server/auth";
import { getClient } from "@/server/dal/clients";
import { NotFoundError } from "@/server/dal/errors";

export const metadata: Metadata = { title: "Client" };

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireOwner();
  const { id } = await params;
  const client = await getClient(actor, id).catch((e: unknown) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const returnTo = `/clients/${client.id}`;
  return (
    <>
      <PageHeader
        title={
          <>
            {client.displayName}
            {client.archivedAt ? <Pill>Archived</Pill> : null}
          </>
        }
        breadcrumb={[{ href: "/clients", label: "Clients" }]}
        actions={
          <>
            <Button asChild variant="secondary">
              <Link href={`/invoices/new?client=${client.id}`}>New invoice</Link>
            </Button>
            <Button asChild variant="tertiary">
              <Link href={`/clients/${client.id}/edit`}>Edit</Link>
            </Button>
            {client.archivedAt ? (
              <ConfirmAction
                action={unarchiveClientAction}
                title="Restore this client?"
                confirmLabel="Restore"
                hidden={{ id: client.id, returnTo }}
                trigger="Restore"
                triggerVariant="tertiary"
              />
            ) : (
              <ConfirmAction
                action={archiveClientAction}
                title="Archive this client?"
                description="It leaves the pickers; invoices and history stay intact."
                confirmLabel="Archive"
                hidden={{ id: client.id, returnTo }}
                trigger="Archive"
                triggerVariant="tertiary"
                destructive
              />
            )}
            <ConfirmAction
              action={deleteClientAction}
              title="Delete this client?"
              description="Only possible while no invoice references the client."
              confirmLabel="Delete"
              hidden={{ id: client.id }}
              trigger="Delete"
              triggerVariant="tertiary"
              destructive
            />
          </>
        }
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent>
            <DescriptionList>
              <Item label="Contact">{client.contactPerson}</Item>
              <Item label="Email">{client.email}</Item>
              <Item label="Phone">{client.phone}</Item>
              <Item label="Country" mono>
                {client.countryCode}
                {client.stateCode ? ` · ${client.stateCode}` : ""}
                {client.gstStateCode ? ` · GST ${client.gstStateCode}` : ""}
              </Item>
              <Item label="Tax ID" mono>
                {client.taxId ? `${client.taxIdType ?? ""} ${client.taxId}`.trim() : null}
              </Item>
              <Item label="Currency" mono>
                {client.currency}
              </Item>
              <Item label="Payment terms">{client.paymentTermsDays} days</Item>
              <Item label="Expected TDS">
                {client.defaultTdsRate ? `${client.defaultTdsRate}%` : null}
              </Item>
              <Item label="Notes">{client.notes}</Item>
            </DescriptionList>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Addresses</CardTitle>
          </CardHeader>
          <CardContent>
            <DescriptionList>
              <Item label="Billing">
                {formatAddressLines(client.billingAddress).map((l) => (
                  <span key={l} className="block">
                    {l}
                  </span>
                ))}
              </Item>
              <Item label="Shipping">
                {client.shippingAddress
                  ? formatAddressLines(client.shippingAddress).map((l) => (
                      <span key={l} className="block">
                        {l}
                      </span>
                    ))
                  : null}
              </Item>
            </DescriptionList>
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Invoices</CardTitle>
            <Button asChild variant="link">
              <Link href={`/invoices?clientId=${client.id}`}>Open the register</Link>
            </Button>
          </CardHeader>
          <CardContent>
            <p className="text-app-body text-ink-subtle">
              Lifetime billed, received and outstanding appear here once invoices exist.
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
