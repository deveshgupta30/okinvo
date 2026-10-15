import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ClientForm } from "@/components/forms/client-form";
import { PageHeader } from "@/components/ui/page-header";
import { requireRole } from "@/server/auth";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("clients.new");
  return { title: t("title") };
}

export default async function NewClientPage() {
  await requireRole("EDITOR");
  const t = await getTranslations("clients");
  return (
    <>
      <PageHeader
        title={t("new.title")}
        breadcrumb={[{ href: "/clients", label: t("list.title") }]}
      />
      <ClientForm client={null} />
    </>
  );
}
