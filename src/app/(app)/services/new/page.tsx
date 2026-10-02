import type { Metadata } from "next";
import { ServiceForm } from "@/components/forms/service-form";
import { PageHeader } from "@/components/ui/page-header";
import { requireRole } from "@/server/auth";
import { listProfiles } from "@/server/dal/profiles";

export const metadata: Metadata = { title: "New service" };

export default async function NewServicePage() {
  const actor = await requireRole("EDITOR");
  const profiles = (await listProfiles(actor)).map((p) => ({ id: p.id, label: p.label }));
  return (
    <>
      <PageHeader title="New service" breadcrumb={[{ href: "/services", label: "Services" }]} />
      <ServiceForm profiles={profiles} service={null} />
    </>
  );
}
