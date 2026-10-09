import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { ScaledPreview } from "@/components/documents/scaled-preview";
import { Wordmark } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { DocumentPreview, PAPER } from "@/lib/documents";
import { formatDate, formatMoney } from "@/lib/format";
import { shareCookieName, verifyShareCookie } from "@/lib/security/share-cookie";
import { issuedDocumentView } from "@/server/dal/documents";
import { lookupShare, recordShareView, shareCookieSecret } from "@/server/dal/share-links";
import { enforceRateLimit } from "@/server/rate-limit";
import { LegalFooter } from "@/components/legal/footer";
import { PasswordForm } from "./password-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("share.viewer");
  return { title: t("title"), robots: { index: false, follow: false } };
}

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
  const t = await getTranslations("share.viewer");
  const tc = await getTranslations("common");
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
          <span className="text-app-caption text-ink-subtle">{t("title")}</span>
        </div>
        {limited ? (
          <p role="alert" className="text-app-body text-semantic-warning">
            {t("rateLimited")}
          </p>
        ) : !view ? (
          <div className="rounded-lg border border-hairline bg-surface-1 p-8">
            <h1 className="text-app-title text-ink">{t("unavailable.title")}</h1>
            <p className="mt-2 text-app-body text-ink-subtle">{t("unavailable.body")}</p>
          </div>
        ) : !unlocked ? (
          <div className="rounded-lg border border-hairline bg-surface-1 p-8">
            <h1 className="text-app-title text-ink">
              {view.kind === "INVOICE"
                ? t("lockedTitleInvoice", { issuer: view.issuerLegalName })
                : t("lockedTitleCreditNote", { issuer: view.issuerLegalName })}
            </h1>
            <p className="mt-2 text-app-body text-ink-subtle">{t("lockedBody")}</p>
            <PasswordForm token={token} error={error ?? null} />
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-start justify-between gap-4 rounded-lg border border-hairline bg-surface-1 p-6">
              <div>
                <h1 className="flex items-center gap-3 text-app-title text-ink">
                  {tc(view.kind === "INVOICE" ? "invoice" : "creditNote")}{" "}
                  <span className="app-mono">{view.number}</span>
                  {view.status === "void" ? (
                    <span className="rounded-pill bg-semantic-danger/12 px-2 text-app-caption text-semantic-danger">
                      {t("void")}
                    </span>
                  ) : null}
                </h1>
                <p className="mt-1 text-app-body text-ink-subtle">
                  {t.rich("byline", {
                    issuer: view.issuerLegalName,
                    client: view.clientName,
                    date: formatDate(view.issueDate, view.locale),
                    total: formatMoney(view.total, view.currency, view.locale),
                    mono: (chunks) => <span className="app-mono">{chunks}</span>,
                    amount: (chunks) => <span className="app-amount">{chunks}</span>,
                  })}
                </p>
              </div>
              <Button asChild>
                <a href={`/i/${token}/pdf`}>{tc("downloadPdf")}</a>
              </Button>
            </div>
            {view.requiresPassword ? (
              <p className="text-app-caption text-ink-subtle">{t("protectedPdf")}</p>
            ) : null}
            {preview}
          </>
        )}
      </section>
      <LegalFooter />
    </main>
  );
}
