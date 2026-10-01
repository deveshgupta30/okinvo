import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ConfirmAction } from "@/components/confirm-action";
import { PaymentMethodForm } from "@/components/forms/payment-method-form";
import { PageHeader } from "@/components/ui/page-header";
import { deletePaymentMethodAction } from "@/server/actions/payment-methods";
import { requireOwner } from "@/server/auth";
import { NotFoundError } from "@/server/dal/errors";
import { getPaymentMethod } from "@/server/dal/payment-methods";

export const metadata: Metadata = { title: "Edit payment method" };

export default async function EditPaymentMethodPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await requireOwner();
  const { id } = await params;
  const method = await getPaymentMethod(actor, id).catch((e: unknown) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  return (
    <>
      <PageHeader
        title={`Edit ${method.name}`}
        breadcrumb={[{ href: "/settings/payment-methods", label: "Payment methods" }]}
        actions={
          <ConfirmAction
            action={deletePaymentMethodAction}
            title={`Delete ${method.name}?`}
            description="Only possible while no invoice or payment references it. Otherwise archive it."
            confirmLabel="Delete"
            hidden={{ id: method.id }}
            trigger="Delete"
            triggerVariant="tertiary"
            destructive
          />
        }
      />
      <PaymentMethodForm method={method} />
    </>
  );
}
