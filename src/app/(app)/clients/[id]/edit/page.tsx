import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ClientForm } from "@/components/forms/client-form";
import { PageHeader } from "@/components/ui/page-header";
import { requireRole } from "@/server/auth";
import { getClient } from "@/server/dal/clients";
import { NotFoundError } from "@/server/dal/errors";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("clients.edit");
  return { title: t("metaTitle") };
}

export default async function EditClientPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireRole("EDITOR");
  const t = await getTranslations("clients");
  const { id } = await params;
  const client = await getClient(actor, id).catch((e: unknown) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  return (
    <>
      <PageHeader
        title={t("edit.title", { name: client.displayName })}
        breadcrumb={[
          { href: "/clients", label: t("list.title") },
          { href: `/clients/${client.id}`, label: client.displayName },
        ]}
      />
      <ClientForm client={client} />
    </>
  );
}
