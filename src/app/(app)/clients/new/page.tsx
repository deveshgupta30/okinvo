import type { Metadata } from "next";
import { ClientForm } from "@/components/forms/client-form";
import { PageHeader } from "@/components/ui/page-header";
import { requireRole } from "@/server/auth";

export const metadata: Metadata = { title: "New client" };

export default async function NewClientPage() {
  await requireRole("EDITOR");
  return (
    <>
      <PageHeader title="New client" breadcrumb={[{ href: "/clients", label: "Clients" }]} />
      <ClientForm client={null} />
    </>
  );
}
