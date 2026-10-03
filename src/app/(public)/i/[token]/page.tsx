import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { ScaledPreview } from "@/components/documents/scaled-preview";
import { Wordmark } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { DocumentPreview, PAPER } from "@/lib/documents";
import { formatDate, formatMoney } from "@/lib/format";
import { shareCookieName, verifyShareCookie } from "@/lib/security/share-cookie";
import { issuedDocumentView } from "@/server/dal/documents";
import { lookupShare, recordShareView, shareCookieSecret } from "@/server/dal/share-links";
import { enforceRateLimit } from "@/server/rate-limit";
import { PasswordForm } from "./password-form";

export const metadata: Metadata = {
  title: "Shared document",
  robots: { index: false, follow: false },
};

const PT_TO_PX = 96 / 72;

/** Public, rate-limited, identical for unknown, revoked and expired links (spec §5.6). */
export default async function SharePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { token } = await params;
  const { error } = await searchParams;
  const limited = (await enforceRateLimit(await headers(), "share")) !== null;
  const view = limited ? null : await lookupShare(token);
  const unlocked =
    view && view.requiresPassword
      ? verifyShareCookie(
          (await cookies()).get(shareCookieName(view.linkId))?.value,
          view.linkId,
          shareCookieSecret(),
          new Date(),
        )
      : view !== null;

  let preview: React.ReactNode = null;
  if (view && unlocked) {
    const { vm, config } = await issuedDocumentView(view.kind, view.documentId, {
      inlineImages: true,
    });
    const paper = PAPER[config.paper.size];
    preview = (
      <ScaledPreview pageWidthPx={paper.width * PT_TO_PX} pageHeightPx={paper.height * PT_TO_PX}>
        <DocumentPreview vm={vm} config={config} />
      </ScaledPreview>
    );
    await recordShareView(view.linkId, "view");
  }

  return (
    <main className="flex min-h-dvh items-start justify-center bg-canvas p-4 pt-10 md:p-6 md:pt-16">
      <section className="flex w-full max-w-3xl flex-col gap-6">
        <div className="flex items-center gap-3">
          <Wordmark className="h-5 text-ink" />
          <span className="text-app-caption text-ink-subtle">Shared document</span>
        </div>
        {limited ? (
          <p role="alert" className="text-app-body text-semantic-warning">
            Too many requests from this address. Please try again in a minute.
          </p>
        ) : !view ? (
          <div className="rounded-lg border border-hairline bg-surface-1 p-8">
            <h1 className="text-app-title text-ink">This link is not available</h1>
            <p className="mt-2 text-app-body text-ink-subtle">
              It may have expired or been revoked by the issuer. Ask them for a new one.
            </p>
          </div>
        ) : !unlocked ? (
          <div className="rounded-lg border border-hairline bg-surface-1 p-8">
            <h1 className="text-app-title text-ink">
              {view.kind === "INVOICE" ? "Invoice" : "Credit note"} from {view.issuerLegalName}
            </h1>
            <p className="mt-2 text-app-body text-ink-subtle">
              This document is password-protected. Enter the password the issuer gave you.
            </p>
            <PasswordForm token={token} error={error ?? null} />
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-start justify-between gap-4 rounded-lg border border-hairline bg-surface-1 p-6">
              <div>
                <h1 className="flex items-center gap-3 text-app-title text-ink">
                  {view.kind === "INVOICE" ? "Invoice" : "Credit note"}{" "}
                  <span className="app-mono">{view.number}</span>
                  {view.status === "void" ? (
                    <span className="rounded-pill bg-semantic-danger/12 px-2 text-app-caption text-semantic-danger">
                      Void
                    </span>
                  ) : null}
                </h1>
                <p className="mt-1 text-app-body text-ink-subtle">
                  From {view.issuerLegalName} to {view.clientName} ·{" "}
                  <span className="app-mono">{formatDate(view.issueDate, view.locale)}</span> ·{" "}
                  <span className="app-amount">
                    {formatMoney(view.total, view.currency, view.locale)}
                  </span>
                </p>
              </div>
              <Button asChild>
                <a href={`/i/${token}/pdf`}>Download PDF</a>
              </Button>
            </div>
            {view.requiresPassword ? (
              <p className="text-app-caption text-ink-subtle">
                The PDF opens with the same password. It can be read and printed; copying and
                editing are locked.
              </p>
            ) : null}
            {preview}
          </>
        )}
      </section>
    </main>
  );
}
