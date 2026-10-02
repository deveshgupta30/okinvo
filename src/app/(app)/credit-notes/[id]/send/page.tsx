import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { EmailComposer } from "@/components/email/composer";
import { SentLog } from "@/components/email/sent-log";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Mono } from "@/components/ui/mono";
import { PageHeader } from "@/components/ui/page-header";
import { withFlash } from "@/lib/flash";
import { requireRole } from "@/server/auth";
import { composerDefaults, listEmailMessages } from "@/server/dal/emails";
import { isDalError, NotFoundError } from "@/server/dal/errors";

export const metadata: Metadata = { title: "Send credit note" };

export default async function SendCreditNotePage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireRole("EDITOR");
  const { id } = await params;
  let defaults;
  try {
    defaults = await composerDefaults(actor, "CREDIT_NOTE", id);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    if (isDalError(e))
      redirect(withFlash(`/credit-notes/${id}`, { kind: "error", message: e.message }));
    throw e;
  }
  const log = await listEmailMessages(actor, { kind: "CREDIT_NOTE", id });
  return (
    <>
      <PageHeader
        title={
          <>
            Send <Mono className="text-app-title">{defaults.number}</Mono>
          </>
        }
        breadcrumb={[
          { href: "/credit-notes", label: "Credit notes" },
          { href: `/credit-notes/${id}`, label: defaults.number },
        ]}
      />
      <div className="grid gap-6 xl:grid-cols-[7fr_5fr]">
        <EmailComposer
          defaults={defaults}
          downloadHref={`/api/documents/preview?creditNote=${id}`}
        />
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
