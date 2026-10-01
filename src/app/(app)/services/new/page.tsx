import type { Metadata } from "next";
import { ServiceForm } from "@/components/forms/service-form";
import { PageHeader } from "@/components/ui/page-header";
import { requireOwner } from "@/server/auth";

export const metadata: Metadata = { title: "New service" };

export default async function NewServicePage() {
  await requireOwner();
  return (
    <>
      <PageHeader title="New service" breadcrumb={[{ href: "/services", label: "Services" }]} />
      <ServiceForm service={null} />
    </>
  );
}
