import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ServiceForm } from "@/components/forms/service-form";
import { PageHeader } from "@/components/ui/page-header";
import { requireRole } from "@/server/auth";
import { listProfiles } from "@/server/dal/profiles";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("catalogue.services");
  return { title: t("newService") };
}

export default async function NewServicePage() {
  const actor = await requireRole("EDITOR");
  const t = await getTranslations("catalogue.services");
  const profiles = (await listProfiles(actor)).map((p) => ({ id: p.id, label: p.label }));
  return (
    <>
      <PageHeader title={t("newService")} breadcrumb={[{ href: "/services", label: t("title") }]} />
      <ServiceForm profiles={profiles} service={null} />
    </>
  );
}
