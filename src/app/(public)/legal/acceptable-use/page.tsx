import type { Metadata } from "next";
import Link from "next/link";
import { LegalDoc, Section } from "@/components/legal/doc";
import { OperatorEmail, Placeholder } from "@/components/legal/placeholder";
import { getLegalOperator } from "@/server/dal/legal";

export const metadata: Metadata = {
  title: "Acceptable Use Policy",
  description:
    "What you may and may not do with this okinvo instance, its API, MCP server and share links.",
};

export const dynamic = "force-dynamic";

const SECTIONS = [
  { id: "scope", title: "Scope" },
  { id: "lawful", title: "Lawful and honest use" },
  { id: "documents", title: "Invoices, credit notes and payments" },
  { id: "access", title: "Accounts, sessions and access controls" },
  { id: "api", title: "API keys, the REST API and the MCP server" },
  { id: "share", title: "Share links and the verification page" },
  { id: "security-testing", title: "Security testing" },
  { id: "malware", title: "Malware, abuse and resource limits" },
  { id: "data", title: "Other people's data" },
  { id: "enforcement", title: "Enforcement" },
  { id: "reporting", title: "Reporting abuse" },
];

export default async function AcceptableUsePage() {
  const op = await getLegalOperator();
  return (
    <LegalDoc
      title="Acceptable Use Policy"
      effectiveDate={op.effectiveDate}
      sections={SECTIONS}
      summary={
        <>
          This policy is part of the{" "}
          <Link href="/legal/terms" className="text-link">
            Terms of Service
          </Link>{" "}
          of the instance operated by <Placeholder op={op} field="legalName" />. It applies to
          everyone who signs in, uses an API key, connects an MCP client, or opens a share link.
        </>
      }
    >
      <Section id="scope" number={1} title="Scope">
        <p>
          okinvo is a tool for issuing invoices and keeping the records around them. Use it for
          that. The rules below exist to keep the operator's records truthful, the service available
          to the people who rely on it, and third parties' data safe. Where these rules say "you",
          they mean every user and every automated client acting with a user's credentials.
        </p>
      </Section>

      <Section id="lawful" number={2} title="Lawful and honest use">
        <ul>
          <li>
            Use the service only in compliance with the laws that apply to you and to the operator.
          </li>
          <li>
            Do not use it to commit, facilitate or conceal fraud, tax evasion, money laundering,
            bribery or any other offence.
          </li>
          <li>
            Do not enter content that is defamatory, infringes intellectual property or privacy
            rights, or that you have no right to hold.
          </li>
          <li>
            Do not impersonate another person or business, or misrepresent who issued a document.
          </li>
        </ul>
      </Section>

      <Section id="documents" number={3} title="Invoices, credit notes and payments">
        <ul>
          <li>
            <strong>No fictitious documents.</strong> Every invoice must describe a genuine supply
            of goods or services at the price actually agreed. Do not issue invoices for supplies
            that did not happen, inflate amounts, or back-date documents.
          </li>
          <li>
            <strong>Tax facts must be true.</strong> Tax registration numbers (GSTIN, VAT, PAN and
            similar), rates, place of supply, reverse-charge and export declarations must reflect
            the real transaction. A declaration printed on a document is your declaration.
          </li>
          <li>
            <strong>Do not try to defeat immutability.</strong> Issued documents cannot be edited by
            design. Do not attempt to alter stored PDFs, numbering sequences or audit records, in
            the app, the database or the storage back end. Corrections are made by voiding,
            re-issuing or crediting, which keeps the trail intact.
          </li>
          <li>
            <strong>Payments.</strong> Record payments and attach receipts that correspond to money
            actually received. Do not use the payments ledger to misrepresent a client's balance.
          </li>
        </ul>
      </Section>

      <Section id="access" number={4} title="Accounts, sessions and access controls">
        <ul>
          <li>Use only the account the operator admitted you under; do not share accounts.</li>
          <li>
            Do not attempt to sign in as someone else, to escalate your role, to reach pages or data
            your role does not allow, or to bypass the allow-list, invitations or deactivation.
          </li>
          <li>
            Do not probe, scan or test the authentication, session, cookie or CSRF mechanisms except
            as permitted in section 7.
          </li>
          <li>Sign out of shared devices. Report a lost or exposed credential immediately.</li>
        </ul>
      </Section>

      <Section id="api" number={5} title="API keys, the REST API and the MCP server">
        <ul>
          <li>
            <strong>Keys are personal.</strong> An API key carries the role of the user who created
            it. Keep it secret, store it in a secrets manager or environment variable, never in
            source code, chat logs, screenshots or shared documents. Rotate it if in doubt; owners
            can revoke any key.
          </li>
          <li>
            <strong>Respect rate limits.</strong> The API answers over-limit requests with HTTP 429
            and a <code className="font-mono">Retry-After</code> header. Back off accordingly. Do
            not run many keys or clients in parallel to multiply your limit.
          </li>
          <li>
            <strong>No scraping or bulk extraction</strong> beyond what the export endpoints provide
            for your own data. Do not build a mirror of the data store through repeated reads.
          </li>
          <li>
            <strong>MCP clients.</strong> The MCP server lets an AI assistant view, draft and issue
            documents under your credentials; it deliberately cannot delete anything. You remain
            responsible for what your assistant does with your key — review what it drafts before it
            is issued, and do not grant it to assistants you do not control.
          </li>
          <li>
            Do not send malformed requests to find crashes, fuzz endpoints, or exploit any defect
            you discover; report it instead (section 11).
          </li>
        </ul>
      </Section>

      <Section id="share" number={6} title="Share links and the verification page">
        <ul>
          <li>
            Share links give whoever holds them access to one document. Send them only to the
            intended recipient and send the password, if any, by a separate channel. Revoke links
            you no longer need.
          </li>
          <li>
            Do not guess tokens or passwords; attempts are rate-limited and logged, and repeated
            guessing is a breach of this policy.
          </li>
          <li>
            The verification page confirms that a document's hash matches what the issuer holds. Do
            not use it to enumerate documents or to assert that an unrelated file is genuine.
          </li>
        </ul>
      </Section>

      <Section id="security-testing" number={7} title="Security testing">
        <p>
          Security research is welcome on an instance you run yourself. On this instance, you may
          not perform vulnerability scanning, penetration testing, load testing or any other
          security testing <strong>without the operator's prior written consent</strong>, which must
          name the scope, the dates and the contact person. Testing outside that scope, or any
          testing that affects other users' data or the service's availability, is forbidden.
        </p>
        <p>
          If you come across a weakness by accident, stop, do not access more data than you already
          have, and report it (section 11). The operator will not pursue good-faith reports made
          this way.
        </p>
      </Section>

      <Section id="malware" number={8} title="Malware, abuse and resource limits">
        <ul>
          <li>
            Do not upload files containing malware, exploits or active content. Uploads are limited
            to the image and PDF types the app accepts and are re-encoded; do not try to circumvent
            that.
          </li>
          <li>
            Do not use the e-mail function to send unsolicited messages, to send to people who are
            not your clients, or at volumes that would get the operator's mail server blocked. The
            app limits sends per hour; do not work around it.
          </li>
          <li>
            Do not deliberately exhaust storage, database or compute resources, for example with
            enormous attachments, runaway automation or repeated exports.
          </li>
        </ul>
      </Section>

      <Section id="data" number={9} title="Other people's data">
        <p>
          The clients and contacts you enter are real people and businesses. Enter only what you
          need to invoice them, keep it accurate, and do not use the service as a general contact
          database or marketing list. If a client asks what you hold about them, use the client
          export to answer. See the{" "}
          <Link href="/legal/privacy" className="text-link">
            Privacy Policy
          </Link>{" "}
          for the operator's obligations and yours.
        </p>
      </Section>

      <Section id="enforcement" number={10} title="Enforcement">
        <p>
          The operator decides, reasonably and in good faith, whether this policy has been breached.
          Depending on the seriousness the operator may warn you, change your role, revoke sessions
          and API keys, revoke share links, suspend or deactivate your account, remove content, or
          report the matter to the authorities. The operator may act without notice where delay
          would cause harm. Audit logs record who did what, and may be used as evidence.
        </p>
      </Section>

      <Section id="reporting" number={11} title="Reporting abuse">
        <p>
          Report suspected abuse of this instance, a lost credential, or a security weakness to{" "}
          <OperatorEmail op={op} field="contactEmail" />. Please include what you saw, when, and how
          to reproduce it, and do not share the details publicly until the operator has had a
          reasonable chance to fix it. The{" "}
          <Link href="/legal/security" className="text-link">
            security page
          </Link>{" "}
          explains how reports are handled.
        </p>
      </Section>
    </LegalDoc>
  );
}
