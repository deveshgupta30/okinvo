import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ConfirmAction } from "@/components/confirm-action";
import { ServiceForm } from "@/components/forms/service-form";
import { PageHeader } from "@/components/ui/page-header";
import { deleteServiceAction } from "@/server/actions/services";
import { requireRole } from "@/server/auth";
import { listProfiles } from "@/server/dal/profiles";
import { NotFoundError } from "@/server/dal/errors";
import { getService } from "@/server/dal/services";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("catalogue.services");
  return { title: t("editMetaTitle") };
}

export default async function EditServicePage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireRole("EDITOR");
  const t = await getTranslations("catalogue");
  const tc = await getTranslations("common");
  const { id } = await params;
  const service = await getService(actor, id).catch((e: unknown) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const profiles = (await listProfiles(actor)).map((p) => ({ id: p.id, label: p.label }));
  return (
    <>
      <PageHeader
        title={t("services.editTitle", { name: service.name })}
        breadcrumb={[{ href: "/services", label: t("services.title") }]}
        actions={
          <ConfirmAction
            action={deleteServiceAction}
            title={t("services.deleteTitle", { name: service.name })}
            description={t("list.deleteDescription")}
            confirmLabel={tc("delete")}
            hidden={{ id: service.id }}
            trigger={tc("delete")}
            triggerVariant="tertiary"
            destructive
          />
        }
      />
      <ServiceForm profiles={profiles} service={service} />
    </>
  );
}
