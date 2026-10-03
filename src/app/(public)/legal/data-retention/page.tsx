import type { Metadata } from "next";
import Link from "next/link";
import { LegalDoc, Section } from "@/components/legal/doc";
import { OperatorEmail, Placeholder } from "@/components/legal/placeholder";
import { getLegalOperator } from "@/server/dal/legal";

export const metadata: Metadata = {
  title: "Data retention",
  description:
    "How long each kind of record is kept on this okinvo instance, and what happens to backups.",
};

export const dynamic = "force-dynamic";

const SECTIONS = [
  { id: "principles", title: "Principles" },
  { id: "schedule", title: "Retention schedule" },
  { id: "statutory", title: "Why issued documents are kept so long" },
  { id: "accounts", title: "Accounts and deactivation" },
  { id: "backups", title: "Backups" },
  { id: "deletion", title: "How deletion works" },
  { id: "requests", title: "Requests for earlier deletion" },
  { id: "review", title: "Review" },
];

const ROWS: [string, string, string][] = [
  [
    "Issued invoices and credit notes (data, PDF/DOCX copies, hashes)",
    "Statutory record period for the issuer's country — 6 years in the UK, 8 years under Indian GST law (72 months from the annual return), up to 10 years where company law requires — counted from the end of the financial year of issue",
    "Legal obligation",
  ],
  [
    "Payments, receipts and bank details on documents",
    "Same as the documents they belong to",
    "Legal obligation",
  ],
  [
    "Draft invoices and credit notes",
    "Until issued or deleted by a user; stale drafts may be removed by the operator after 12 months of inactivity",
    "Contract",
  ],
  [
    "Clients, services, products, issuer profiles",
    "While in use; archived records are kept as long as a document refers to them, otherwise deleted on request",
    "Contract / legal obligation",
  ],
  [
    "E-mail messages sent (recipients, subject, body, status)",
    "Same as the document they carried",
    "Legal obligation / legitimate interest",
  ],
  ["Share links and their counts", "Until revoked or expired, then 90 days", "Legitimate interest"],
  [
    "Audit log",
    "Same as the longest record it refers to; security events at least 2 years",
    "Legal obligation / legitimate interest",
  ],
  [
    "User accounts and preferences",
    "While admitted; deactivated accounts are kept (without sessions) so the audit trail stays attributable",
    "Contract",
  ],
  ["Sessions", "30 days of inactivity, or until sign-out, revocation or deactivation", "Contract"],
  ["API keys", "Until revoked; last-used time kept", "Contract"],
  ["Verification tokens", "Life of the document", "Legal obligation"],
  [
    "Rate-limit counters (keyed by IP address)",
    "The limit window: 1 minute to 1 hour",
    "Legitimate interest",
  ],
  [
    "Technical logs (web server, application)",
    "At most 30 days, unless retained longer for an active security investigation",
    "Legitimate interest",
  ],
  ["Local usage counters (if enabled)", "Per path per day, 400 days", "Legitimate interest"],
  ["Backups", "See section 5", "Legal obligation / legitimate interest"],
];

export default async function DataRetentionPage() {
  const op = await getLegalOperator();
  return (
    <LegalDoc
      title="Data retention"
      effectiveDate={op.effectiveDate}
      sections={SECTIONS}
      summary={
        <>
          This schedule says how long the instance operated by{" "}
          <Placeholder op={op} field="legalName" /> keeps each kind of record, and why. It is part
          of the{" "}
          <Link href="/legal/privacy" className="text-link">
            Privacy Policy
          </Link>
          .
        </>
      }
    >
      <Section id="principles" number={1} title="Principles">
        <ul>
          <li>
            Keep data only as long as there is a reason: a contract, a legal duty or a security
            need.
          </li>
          <li>Keep what the law requires for exactly as long as it requires, then remove it.</li>
          <li>
            Prefer deleting over archiving; where a record must stay because a document refers to
            it, archive it and stop using it for anything else.
          </li>
          <li>Apply the same periods to backups, with the delay backups inherently add.</li>
        </ul>
      </Section>

      <Section id="schedule" number={2} title="Retention schedule">
        <table className="w-full border-collapse text-left text-app-caption">
          <thead>
            <tr className="border-b border-hairline text-ink">
              <th className="py-2 pr-4">Record</th>
              <th className="py-2 pr-4">Kept for</th>
              <th className="py-2">Basis</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map(([record, period, basis]) => (
              <tr key={record} className="border-b border-hairline align-top">
                <td className="py-2 pr-4 text-ink">{record}</td>
                <td className="py-2 pr-4">{period}</td>
                <td className="py-2">{basis}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section id="statutory" number={3} title="Why issued documents are kept so long">
        <p>
          An invoice is a tax and accounting record for both parties. Laws such as the Indian GST
          Act (section 36), the Indian Income-tax Act, the UK VAT Act and Companies Act, and their
          equivalents elsewhere require the issuer to keep invoices, credit notes and the payments
          against them for several years and to be able to produce them unchanged. okinvo keeps
          issued documents immutable and hashed for that reason; it cannot edit or delete them on
          request, and the operator will not do so by hand. When the period for a document ends, the
          operator may delete it together with everything that exists only because of it.
        </p>
      </Section>

      <Section id="accounts" number={4} title="Accounts and deactivation">
        <p>
          When a user is deactivated (by the operator or at the user's request) their sessions and
          API keys end immediately. The account record itself stays, without the ability to sign in,
          so that documents and audit entries remain attributable to a named person. Profile photos
          and preferences are removed. If the user never created or changed anything, the operator
          may delete the account entirely.
        </p>
      </Section>

      <Section id="backups" number={5} title="Backups">
        <p>
          okinvo ships a backup procedure (database dump plus the document store) and a tested
          restore drill. The operator decides the schedule and the number of backups kept; a common
          setting is a daily backup kept for 30 days plus a monthly backup kept for a year. A backup
          is a point-in-time copy: a record deleted from the live instance may remain in backups
          until those backups age out, and is not restored except to recover from data loss, in
          which case the deletion is applied again.
        </p>
      </Section>

      <Section id="deletion" number={6} title="How deletion works">
        <ul>
          <li>
            Users delete drafts, clients, services and products themselves. Records a document
            refers to cannot be deleted; they are archived instead.
          </li>
          <li>
            Stored files (documents, attachments, images) are removed from the document store when
            their database record is deleted; the storage layer never exposes them publicly.
          </li>
          <li>
            Deleting a record is written to the audit log (who, when, what), which is itself kept
            according to the schedule.
          </li>
        </ul>
      </Section>

      <Section id="requests" number={7} title="Requests for earlier deletion">
        <p>
          If you ask the operator to delete data about you, the operator will delete what is not
          needed for a contract or a legal duty, and will tell you what must be kept and until when.
          Write to <OperatorEmail op={op} field="privacyEmail" />.
        </p>
      </Section>

      <Section id="review" number={8} title="Review">
        <p>
          The operator reviews this schedule at least yearly and whenever the law of{" "}
          <Placeholder op={op} field="country" /> changes the record-keeping periods that apply to
          the issuers using this instance.
        </p>
      </Section>
    </LegalDoc>
  );
}
