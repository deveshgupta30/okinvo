import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { EmailComposer } from "@/components/email/composer";
import { SentLog } from "@/components/email/sent-log";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Mono } from "@/components/ui/mono";
import { PageHeader } from "@/components/ui/page-header";
import { withFlash } from "@/lib/flash";
import { requireOwner } from "@/server/auth";
import { composerDefaults, listEmailMessages } from "@/server/dal/emails";
import { isDalError, NotFoundError } from "@/server/dal/errors";

export const metadata: Metadata = { title: "Send invoice" };

export default async function SendInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireOwner();
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
  return (
    <>
      <PageHeader
        title={
          <>
            Send <Mono className="text-app-title">{defaults.number}</Mono>
          </>
        }
        breadcrumb={[
          { href: "/invoices", label: "Invoices" },
          { href: `/invoices/${id}`, label: defaults.number },
        ]}
        description={
          defaults.sentAt
            ? "Already marked as sent; sending again adds another log entry."
            : undefined
        }
      />
      <div className="grid gap-6 xl:grid-cols-[7fr_5fr]">
        <EmailComposer defaults={defaults} downloadHref={`/api/documents/preview?invoice=${id}`} />
        <Card>
          <CardHeader>
            <CardTitle>Previous sends</CardTitle>
          </CardHeader>
          <CardContent>
            <SentLog rows={log} timeZone={actor.timezone} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
