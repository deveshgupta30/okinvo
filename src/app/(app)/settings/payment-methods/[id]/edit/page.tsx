import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ConfirmAction } from "@/components/confirm-action";
import { PaymentMethodForm } from "@/components/forms/payment-method-form";
import { PageHeader } from "@/components/ui/page-header";
import { deletePaymentMethodAction } from "@/server/actions/payment-methods";
import { requireOwner } from "@/server/auth";
import { NotFoundError } from "@/server/dal/errors";
import { getPaymentMethod } from "@/server/dal/payment-methods";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings.paymentMethods.edit");
  return { title: t("metaTitle") };
}

export default async function EditPaymentMethodPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await requireOwner();
  const t = await getTranslations("settings.paymentMethods");
  const tc = await getTranslations("common");
  const { id } = await params;
  const method = await getPaymentMethod(actor, id).catch((e: unknown) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  return (
    <>
      <PageHeader
        title={t("edit.title", { name: method.name })}
        breadcrumb={[{ href: "/settings/payment-methods", label: t("title") }]}
        actions={
          <ConfirmAction
            action={deletePaymentMethodAction}
            title={t("edit.deleteTitle", { name: method.name })}
            description={t("edit.deleteDescription")}
            confirmLabel={tc("delete")}
            hidden={{ id: method.id }}
            trigger={tc("delete")}
            triggerVariant="tertiary"
            destructive
          />
        }
      />
      <PaymentMethodForm method={method} />
    </>
  );
}
