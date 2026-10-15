import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { EmailComposer } from "@/components/email/composer";
import { SentLog } from "@/components/email/sent-log";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Mono } from "@/components/ui/mono";
import { PageHeader } from "@/components/ui/page-header";
import { withFlash } from "@/lib/flash";
import { requireRole } from "@/server/auth";
import { composerDefaults, listEmailMessages } from "@/server/dal/emails";
import { isDalError, NotFoundError } from "@/server/dal/errors";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("invoices.send");
  return { title: t("metaTitle") };
}

export default async function SendInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireRole("EDITOR");
  const { id } = await params;
  let defaults;
  try {
    defaults = await composerDefaults(actor, "INVOICE", id);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    if (isDalError(e))
      redirect(withFlash(`/invoices/${id}`, { kind: "error", message: e.message }));
    throw e;
  }
  const log = await listEmailMessages(actor, { kind: "INVOICE", id });
  const t = await getTranslations("invoices.send");
  const ts = await getTranslations("invoices.shared");
  return (
    <>
      <PageHeader
        title={
          <>
            {t.rich("title", {
              number: defaults.number,
              mono: (chunks) => <Mono className="text-app-title">{chunks}</Mono>,
            })}
          </>
        }
        breadcrumb={[
          { href: "/invoices", label: ts("invoices") },
          { href: `/invoices/${id}`, label: defaults.number },
        ]}
        description={defaults.sentAt ? t("alreadySent") : undefined}
      />
      <div className="grid gap-6 xl:grid-cols-[7fr_5fr]">
        <EmailComposer defaults={defaults} downloadHref={`/api/documents/preview?invoice=${id}`} />
        <Card>
          <CardHeader>
            <CardTitle>{t("previousSends")}</CardTitle>
          </CardHeader>
          <CardContent>
            <SentLog rows={log} timeZone={actor.timezone} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
