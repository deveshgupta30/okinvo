import type { Metadata } from "next";
import { ClientForm } from "@/components/forms/client-form";
import { PageHeader } from "@/components/ui/page-header";
import { requireOwner } from "@/server/auth";

export const metadata: Metadata = { title: "New client" };

export default async function NewClientPage() {
  await requireOwner();
  return (
    <>
      <PageHeader title="New client" breadcrumb={[{ href: "/clients", label: "Clients" }]} />
      <ClientForm client={null} />
    </>
  );
}
