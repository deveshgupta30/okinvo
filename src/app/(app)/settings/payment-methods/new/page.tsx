import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PaymentMethodForm } from "@/components/forms/payment-method-form";
import { PageHeader } from "@/components/ui/page-header";
import { requireOwner } from "@/server/auth";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings.paymentMethods.new");
  return { title: t("metaTitle") };
}

export default async function NewPaymentMethodPage() {
  await requireOwner();
  const t = await getTranslations("settings.paymentMethods");
  return (
    <>
      <PageHeader
        title={t("new.title")}
        breadcrumb={[{ href: "/settings/payment-methods", label: t("title") }]}
      />
      <PaymentMethodForm method={null} />
    </>
  );
}
