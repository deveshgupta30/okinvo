import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ClientForm } from "@/components/forms/client-form";
import { PageHeader } from "@/components/ui/page-header";
import { requireRole } from "@/server/auth";
import { getClient } from "@/server/dal/clients";
import { NotFoundError } from "@/server/dal/errors";

export const metadata: Metadata = { title: "Edit client" };

export default async function EditClientPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireRole("EDITOR");
  const { id } = await params;
  const client = await getClient(actor, id).catch((e: unknown) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  return (
    <>
      <PageHeader
        title={`Edit ${client.displayName}`}
        breadcrumb={[
          { href: "/clients", label: "Clients" },
          { href: `/clients/${client.id}`, label: client.displayName },
        ]}
      />
      <ClientForm client={client} />
    </>
  );
}
