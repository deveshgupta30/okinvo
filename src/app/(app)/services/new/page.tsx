import type { Metadata } from "next";
import { ServiceForm } from "@/components/forms/service-form";
import { PageHeader } from "@/components/ui/page-header";
import { requireRole } from "@/server/auth";

export const metadata: Metadata = { title: "New service" };

export default async function NewServicePage() {
  await requireRole("EDITOR");
  return (
    <>
      <PageHeader title="New service" breadcrumb={[{ href: "/services", label: "Services" }]} />
      <ServiceForm service={null} />
    </>
  );
}
