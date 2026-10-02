import type { Metadata } from "next";
import { headers } from "next/headers";
import { HashCheck } from "@/components/verify/hash-check";
import { formatDate, formatMoney } from "@/lib/format";
import { lookupByToken } from "@/server/dal/verification";
import { enforceRateLimit } from "@/server/rate-limit";

export const metadata: Metadata = {
  title: "Verify document",
  robots: { index: false, follow: false },
};

/** Public, rate-limited, and identical for unknown tokens (SPEC §4.12). */
export default async function VerifyPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
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
          <span className="text-app-section text-ink">Document verification</span>
        </div>
        {limited ? (
          <p role="alert" className="text-app-body text-semantic-warning">
            Too many checks from this address. Please try again in a minute.
          </p>
        ) : !result ? (
          <>
            <h1 className="text-app-title text-ink">No such document</h1>
            <p className="mt-2 text-app-body text-ink-subtle">
              This link does not match any issued document. Check the QR code or the link you were
              given, or contact the issuer.
            </p>
          </>
        ) : (
          <>
            <h1 className="flex items-center gap-3 text-app-title text-ink">
              {result.kind === "INVOICE" ? "Invoice" : "Credit note"}{" "}
              <span className="text-app-mono">{result.number}</span>
              {result.status === "void" ? (
                <span className="rounded-pill bg-semantic-danger/12 px-2 text-app-caption text-semantic-danger">
                  Void
                </span>
              ) : (
                <span className="rounded-pill bg-semantic-success/12 px-2 text-app-caption text-semantic-success">
                  Valid
                </span>
              )}
            </h1>
            <dl className="mt-6 grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-app-body">
              <dt className="text-app-label text-ink-subtle">Issued by</dt>
              <dd className="text-ink">
                {result.issuerLegalName}
                {result.gstin ? (
                  <span className="block text-app-mono text-ink-subtle">GSTIN {result.gstin}</span>
                ) : null}
              </dd>
              <dt className="text-app-label text-ink-subtle">Issued to</dt>
              <dd className="text-ink">{result.clientName}</dd>
              <dt className="text-app-label text-ink-subtle">Issue date</dt>
              <dd className="text-app-mono text-ink">
                {formatDate(result.issueDate, result.locale)}
              </dd>
              <dt className="text-app-label text-ink-subtle">Total</dt>
              <dd className="text-app-amount text-ink">
                {formatMoney(result.total, result.currency, result.locale)}
              </dd>
            </dl>
            {result.status === "void" ? (
              <p className="mt-4 text-app-body text-semantic-danger">
                This document was voided by the issuer and is no longer valid.
              </p>
            ) : null}
            <div className="mt-8">
              <h2 className="text-app-section text-ink">Stored copies</h2>
              <p className="mt-1 text-app-caption text-ink-subtle">
                SHA-256 of every PDF version the issuer holds. Pick your copy to compare it in your
                browser — nothing is uploaded.
              </p>
              <ul className="mt-3 flex flex-col gap-2">
                {result.hashes.length === 0 ? (
                  <li className="text-app-caption text-ink-subtle">
                    No PDF has been generated yet.
                  </li>
                ) : (
                  result.hashes.map((h) => (
                    <li
                      key={`${h.format}-${h.version}`}
                      className="rounded-md bg-surface-2 px-3 py-2"
                    >
                      <span className="text-app-caption text-ink-subtle">
                        {h.format === "PDF_PROTECTED"
                          ? `Password-protected copy ${h.version}`
                          : `Version ${h.version}`}
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
