import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ConfirmAction } from "@/components/confirm-action";
import { ServiceForm } from "@/components/forms/service-form";
import { PageHeader } from "@/components/ui/page-header";
import { deleteServiceAction } from "@/server/actions/services";
import { requireOwner } from "@/server/auth";
import { NotFoundError } from "@/server/dal/errors";
import { getService } from "@/server/dal/services";

export const metadata: Metadata = { title: "Edit service" };

export default async function EditServicePage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireOwner();
  const { id } = await params;
  const service = await getService(actor, id).catch((e: unknown) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  return (
    <>
      <PageHeader
        title={`Edit ${service.name}`}
        breadcrumb={[{ href: "/services", label: "Services" }]}
        actions={
          <ConfirmAction
            action={deleteServiceAction}
            title={`Delete ${service.name}?`}
            description="Only possible while no invoice line references it. Otherwise archive it."
            confirmLabel="Delete"
            hidden={{ id: service.id }}
            trigger="Delete"
            triggerVariant="tertiary"
            destructive
          />
        }
      />
      <ServiceForm service={service} />
    </>
  );
}
