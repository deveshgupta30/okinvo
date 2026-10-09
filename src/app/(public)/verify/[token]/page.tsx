import type { Metadata } from "next";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { HashCheck } from "@/components/verify/hash-check";
import { formatDate, formatMoney } from "@/lib/format";
import { lookupByToken } from "@/server/dal/verification";
import { enforceRateLimit } from "@/server/rate-limit";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("verify");
  return { title: t("metaTitle"), robots: { index: false, follow: false } };
}

/** Public, rate-limited, and identical for unknown tokens (SPEC §4.12). */
export default async function VerifyPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const t = await getTranslations("verify");
  const tc = await getTranslations("common");
  const limited = await enforceRateLimit(await headers(), "verify");
  const result = limited ? null : await lookupByToken(token);
  return (
    <main className="flex min-h-dvh items-start justify-center bg-canvas p-6 pt-16">
      <section className="w-full max-w-lg rounded-lg border border-hairline bg-surface-1 p-8">
        <div className="mb-6 flex items-center gap-3">
          <span
            aria-hidden
            className="flex size-8 items-center justify-center rounded-md bg-primary text-app-label font-semibold text-on-primary"
          >
            ok
          </span>
          <span className="text-app-section text-ink">{t("heading")}</span>
        </div>
        {limited ? (
          <p role="alert" className="text-app-body text-semantic-warning">
            {t("rateLimited")}
          </p>
        ) : !result ? (
          <>
            <h1 className="text-app-title text-ink">{t("notFound.title")}</h1>
            <p className="mt-2 text-app-body text-ink-subtle">{t("notFound.body")}</p>
          </>
        ) : (
          <>
            <h1 className="flex items-center gap-3 text-app-title text-ink">
              {tc(result.kind === "INVOICE" ? "invoice" : "creditNote")}{" "}
              <span className="text-app-mono">{result.number}</span>
              {result.status === "void" ? (
                <span className="rounded-pill bg-semantic-danger/12 px-2 text-app-caption text-semantic-danger">
                  {t("status.void")}
                </span>
              ) : (
                <span className="rounded-pill bg-semantic-success/12 px-2 text-app-caption text-semantic-success">
                  {t("status.valid")}
                </span>
              )}
            </h1>
            <dl className="mt-6 grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-app-body">
              <dt className="text-app-label text-ink-subtle">{t("issuedBy")}</dt>
              <dd className="text-ink">
                {result.issuerLegalName}
                {result.gstin ? (
                  <span className="block text-app-mono text-ink-subtle">
                    {t("gstin", { gstin: result.gstin })}
                  </span>
                ) : null}
              </dd>
              <dt className="text-app-label text-ink-subtle">{t("issuedTo")}</dt>
              <dd className="text-ink">{result.clientName}</dd>
              <dt className="text-app-label text-ink-subtle">{t("issueDate")}</dt>
              <dd className="text-app-mono text-ink">
                {formatDate(result.issueDate, result.locale)}
              </dd>
              <dt className="text-app-label text-ink-subtle">{t("total")}</dt>
              <dd className="text-app-amount text-ink">
                {formatMoney(result.total, result.currency, result.locale)}
              </dd>
            </dl>
            {result.status === "void" ? (
              <p className="mt-4 text-app-body text-semantic-danger">{t("voided")}</p>
            ) : null}
            <div className="mt-8">
              <h2 className="text-app-section text-ink">{t("storedCopies.title")}</h2>
              <p className="mt-1 text-app-caption text-ink-subtle">
                {t("storedCopies.description")}
              </p>
              <ul className="mt-3 flex flex-col gap-2">
                {result.hashes.length === 0 ? (
                  <li className="text-app-caption text-ink-subtle">{t("storedCopies.empty")}</li>
                ) : (
                  result.hashes.map((h) => (
                    <li
                      key={`${h.format}-${h.version}`}
                      className="rounded-md bg-surface-2 px-3 py-2"
                    >
                      <span className="text-app-caption text-ink-subtle">
                        {h.format === "PDF_PROTECTED"
                          ? t("storedCopies.protectedVersion", { version: h.version })
                          : t("storedCopies.version", { version: h.version })}
                      </span>
                      <span className="block text-app-mono break-all text-ink">{h.sha256}</span>
                    </li>
                  ))
                )}
              </ul>
              <HashCheck hashes={result.hashes} />
            </div>
          </>
        )}
      </section>
    </main>
  );
}
