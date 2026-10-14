import type { Metadata } from "next";
import Link from "next/link";
import { LegalDoc, Section } from "@/components/legal/doc";
import { OperatorEmail, Placeholder } from "@/components/legal/placeholder";
import { getLegalOperator } from "@/server/dal/legal";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "What personal data this okinvo instance holds, why, for how long, who sees it, and your rights.",
};

export const dynamic = "force-dynamic";

const SECTIONS = [
  { id: "who", title: "Who is responsible" },
  { id: "two-roles", title: "Two roles: users and your clients" },
  { id: "data", title: "What data is held, and why" },
  { id: "bases", title: "Lawful bases" },
  { id: "cookies", title: "Cookies and local storage" },
  { id: "sharing", title: "Who receives the data" },
  { id: "processors", title: "Processors and third-party services" },
  { id: "transfers", title: "International transfers" },
  { id: "retention", title: "How long data is kept" },
  { id: "security", title: "How data is protected" },
  { id: "rights", title: "Your rights" },
  { id: "india", title: "India: Digital Personal Data Protection Act" },
  { id: "uk-eu", title: "UK and EU: GDPR" },
  { id: "california", title: "California: CCPA/CPRA" },
  { id: "children", title: "Children" },
  { id: "automated", title: "Automated decisions and profiling" },
  { id: "changes", title: "Changes to this policy" },
  { id: "contact", title: "Contact and complaints" },
];

export default async function PrivacyPage() {
  const op = await getLegalOperator();
  return (
    <LegalDoc
      title="Privacy Policy"
      effectiveDate={op.effectiveDate}
      sections={SECTIONS}
      summary={
        <>
          This instance of okinvo is operated by <Placeholder op={op} field="legalName" />,{" "}
          <Placeholder op={op} field="address" />, <Placeholder op={op} field="country" />. This
          policy explains, in plain terms, what personal data the instance holds, why, who can see
          it, how long it is kept and what you can ask for. okinvo is self-hosted: the data stays on
          infrastructure the operator controls, and no analytics, advertising or tracking services
          are used.
        </>
      }
    >
      <Section id="who" number={1} title="Who is responsible">
        <p>
          The <strong>controller</strong> for the data described here is the operator named above.
          Privacy questions and requests go to <OperatorEmail op={op} field="privacyEmail" />
          {op.dpoEmail ? (
            <>
              ; the operator's data protection officer can be reached at{" "}
              <OperatorEmail op={op} field="dpoEmail" />
            </>
          ) : null}
          .
        </p>
        <p>
          The authors of the okinvo software do not operate this instance, do not receive any data
          from it, and are not a controller or processor of anything you enter.
        </p>
      </Section>

      <Section id="two-roles" number={2} title="Two roles: users and your clients">
        <p>There are two kinds of people whose data the instance holds:</p>
        <ul>
          <li>
            <strong>Users</strong> - the owner, editors and viewers who sign in. For their data the
            operator is the controller.
          </li>
          <li>
            <strong>Clients and contacts</strong> - the businesses and people a user invoices. A
            user who enters client data decides why it is held and is responsible for having a
            lawful basis; the operator holds it to provide the service. Where the user is the
            operator's own business, the operator is the controller; where a user invoices in their
            own name through the operator's instance, the user is the controller and the operator
            processes the data on the user's instructions under the Terms of Service.
          </li>
        </ul>
        <p>
          Recipients of invoices and share links who visit the public verification or share pages
          are visitors; the instance keeps no account for them.
        </p>
      </Section>

      <Section id="data" number={3} title="What data is held, and why">
        <ul>
          <li>
            <strong>Account data</strong> (users): name, e-mail address, optional profile photo,
            role, preferences (theme, accent colour, language, country, currency, time zone),
            onboarding state, sign-in method and, for password sign-in, a salted hash of the
            password. Purpose: to operate your account and admit you.
          </li>
          <li>
            <strong>Identity provider data</strong> (users signing in through Google, GitHub,
            Keycloak or Casdoor, if the operator configured one): the provider's account identifier,
            name, e-mail and picture URL. Purpose: sign-in.
          </li>
          <li>
            <strong>Sessions, API keys and tokens</strong>: session identifiers, the user agent and
            IP address recorded by the authentication library for the session, hashed API keys, and
            verification tokens for documents. Purpose: keep you signed in, authenticate API and MCP
            clients, and let recipients verify documents.
          </li>
          <li>
            <strong>Issuer profiles</strong>: the legal name, address, tax identifiers (for example
            GSTIN, PAN, VAT number, LUT), bank and payment details, logo, signature and stamp of the
            businesses invoicing from this instance. Purpose: print and issue valid invoices.
            Payment details and tax identifiers are encrypted at rest.
          </li>
          <li>
            <strong>Client data</strong>: display and legal names, contact person, e-mail, phone,
            billing and shipping addresses, tax identifiers, currency and payment terms. Purpose:
            address and send invoices and keep the records the law requires.
          </li>
          <li>
            <strong>Documents</strong>: invoices, credit notes, their line items, totals, notes,
            terms, stored PDF and DOCX files, their hashes, e-mail messages sent (recipients,
            subject, body, status), payments received, receipts and other attachments. Purpose: the
            service itself and statutory record-keeping.
          </li>
          <li>
            <strong>Audit log</strong>: who did what and when (user, action, the record affected,
            the before/after values with secrets redacted). Purpose: accountability, security and
            demonstrating the integrity of issued documents.
          </li>
          <li>
            <strong>Technical logs</strong>: the web server and application may log request paths,
            status codes, timings, error messages and client IP addresses for a short time. Purpose:
            operating and securing the service. Rate-limiting counters keyed by IP address are kept
            in memory or in the database for the limit window only.
          </li>
          <li>
            <strong>Share link statistics</strong>: view and download counts and the time of the
            last view per link - no IP address and no identity of the viewer.
          </li>
          <li>
            <strong>Usage counters</strong> (only if the operator enabled local analytics): the
            number of page views per path per day. No cookie, no IP address, no user identifier.
          </li>
        </ul>
      </Section>

      <Section id="bases" number={4} title="Lawful bases">
        <ul>
          <li>
            <strong>Contract</strong> (Terms of Service): account, session, document and payment
            data needed to provide the service to users.
          </li>
          <li>
            <strong>Legal obligation</strong>: keeping issued invoices, credit notes, payments and
            the related client data for the periods tax and company law require, and keeping the
            audit trail that shows the records are intact.
          </li>
          <li>
            <strong>Legitimate interests</strong>: security logging, rate limiting, audit records,
            backups and fraud prevention - interests the operator has weighed against users' and
            clients' privacy and found proportionate because the data is minimal and kept briefly.
          </li>
          <li>
            <strong>Consent</strong>: nothing here relies on consent, because no optional processing
            (analytics, marketing, tracking) takes place. Where the operator later adds something
            optional, it will ask first.
          </li>
        </ul>
      </Section>

      <Section id="cookies" number={5} title="Cookies and local storage">
        <p>
          The instance sets only strictly necessary cookies (session and display preferences). They
          are listed with their lifetimes in the{" "}
          <Link href="/legal/cookies" className="text-link">
            Cookie Policy
          </Link>
          . No third-party cookies are set and no cross-site tracking takes place.
        </p>
      </Section>

      <Section id="sharing" number={6} title="Who receives the data">
        <ul>
          <li>
            <strong>Other users of this instance</strong>, according to their role: owners see
            everything; editors see clients, documents and payments; viewers see what they are given
            access to read.
          </li>
          <li>
            <strong>Recipients of your documents</strong>: the people you e-mail or share a link
            with receive the document you chose and the issuer details printed on it.
          </li>
          <li>
            <strong>Visitors of the verification page</strong> see the issuer's legal name and tax
            registration, the client's display name, the document number, date and total, its
            validity, and the hashes of stored copies - never payment status, never drafts.
          </li>
          <li>
            <strong>Authorities and advisers</strong>: the operator may disclose records to tax
            authorities, auditors, accountants or lawyers where required by law or to establish or
            defend legal claims.
          </li>
          <li>The operator does not sell personal data and does not share it for advertising.</li>
        </ul>
      </Section>

      <Section id="processors" number={7} title="Processors and third-party services">
        <p>
          By default the instance uses no external service at all. The operator may have configured
          some; each one receives only what is needed for its function:
        </p>
        <ul>
          <li>
            <strong>SMTP e-mail server</strong>: the recipients, subject, body and attachment of
            each message you send.
          </li>
          <li>
            <strong>Object storage (S3-compatible)</strong>: stored documents, attachments and
            backups, if the operator chose it over local disk.
          </li>
          <li>
            <strong>Identity provider</strong>: your sign-in, and from it your name, e-mail and
            picture.
          </li>
          <li>
            <strong>Exchange-rate provider</strong> (only if online rates are enabled): the request
            carries no personal data.
          </li>
          <li>
            <strong>Hosting</strong>: the servers or cloud account the operator runs the instance
            on.
          </li>
        </ul>
        <p>
          The operator is responsible for choosing providers that offer adequate protection and for
          having the necessary agreements with them.
        </p>
      </Section>

      <Section id="transfers" number={8} title="International transfers">
        <p>
          Data lives where the operator hosts the instance: <Placeholder op={op} field="country" />{" "}
          unless the operator tells you otherwise. If any configured service is located in another
          country, the operator relies on that provider's adequacy status or standard contractual
          clauses (or the equivalent under your law) for the transfer. Documents you send by e-mail
          travel to wherever the recipient's mailbox is.
        </p>
      </Section>

      <Section id="retention" number={9} title="How long data is kept">
        <p>
          The{" "}
          <Link href="/legal/data-retention" className="text-link">
            data retention schedule
          </Link>{" "}
          sets out periods per record type. In short: issued documents, payments and the audit trail
          are kept for the statutory record period (typically six to ten years depending on the law
          that applies to the issuer); drafts, sessions, rate-limit counters and technical logs are
          short-lived; accounts are kept while admitted and deactivated afterwards, with the records
          they created retained.
        </p>
      </Section>

      <Section id="security" number={10} title="How data is protected">
        <p>
          Measures include: HTTPS for every connection; a strict content-security policy; sessions
          in HttpOnly cookies; password hashing; encryption at rest of tax identifiers, payment
          details, SMTP credentials and tokens; role-based access enforced on every request; rate
          limits on sign-in, exports, e-mail and public pages; an immutable audit trail; hashed and
          verifiable stored documents; re-encoding of every uploaded image; and documented, tested
          backups. The{" "}
          <Link href="/legal/security" className="text-link">
            security page
          </Link>{" "}
          has more detail and the responsible-disclosure contact.
        </p>
      </Section>

      <Section id="rights" number={11} title="Your rights">
        <p>
          Depending on where you live you may have the right to <strong>access</strong> the data
          held about you, to <strong>correct</strong> it, to have it <strong>erased</strong>, to{" "}
          <strong>restrict</strong> or <strong>object</strong> to its processing, to{" "}
          <strong>port</strong> it to another provider, to <strong>withdraw consent</strong> (where
          processing relied on it) and to <strong>complain</strong> to a supervisory authority. To
          exercise a right, write to <OperatorEmail op={op} field="privacyEmail" />. The operator
          will respond within the period your law sets (one month under GDPR, extendable where the
          request is complex) and may ask you to confirm your identity first.
        </p>
        <p>
          Some data cannot be erased on request because the law requires the operator to keep it:
          issued invoices and credit notes, the payments against them and the audit trail. In that
          case the operator will tell you what is kept and why.
        </p>
        <p>
          Users can see much of their own data in the app: Settings → Account shows your profile and
          preferences; owners can export every record from Settings → Data.
        </p>
      </Section>

      <Section id="india" number={12} title="India: Digital Personal Data Protection Act">
        <p>
          Where the Digital Personal Data Protection Act, 2023 applies, the operator is the Data
          Fiduciary for users' data and, for client data entered by a user invoicing in their own
          name, processes it as a Data Processor on that user's instructions. Data is processed for
          the purposes in section 3, with notice given here. Data Principals may exercise the rights
          in section 11 and may nominate another person to exercise them; the grievance contact is{" "}
          <OperatorEmail op={op} field="privacyEmail" />. Where the operator cannot resolve a
          grievance, you may approach the Data Protection Board of India.
        </p>
      </Section>

      <Section id="uk-eu" number={13} title="UK and EU: GDPR">
        <p>
          Where the UK GDPR or the EU GDPR applies, the lawful bases are those in section 4, the
          rights are those in section 11, and you may lodge a complaint with the Information
          Commissioner's Office (UK) or the supervisory authority of your member state. The operator
          keeps a record of processing activities and will notify the authority and, where required,
          affected people of a personal data breach within the statutory periods.
        </p>
      </Section>

      <Section id="california" number={14} title="California: CCPA/CPRA">
        <p>
          The operator does not sell or share personal information for cross-context behavioural
          advertising and does not use sensitive personal information for purposes beyond those
          listed. California residents have the rights to know, delete, correct and port their
          personal information and not to be discriminated against for exercising them; requests go
          to <OperatorEmail op={op} field="privacyEmail" />.
        </p>
      </Section>

      <Section id="children" number={15} title="Children">
        <p>
          The service is a business tool and is not intended for anyone under 18. The operator does
          not knowingly admit children as users. If you believe a child's data has been entered as a
          client, contact the operator so it can be removed where the law allows.
        </p>
      </Section>

      <Section id="automated" number={16} title="Automated decisions and profiling">
        <p>
          The instance makes no automated decisions with legal or similarly significant effects
          about anyone, and builds no profiles. Computations (totals, tax, due dates, overdue
          status) are arithmetic on the data you entered, reviewable by you before you act on them.
        </p>
      </Section>

      <Section id="changes" number={17} title="Changes to this policy">
        <p>
          The operator may update this policy when the service, the law or the configured services
          change. The effective date at the top changes with it and signed-in users will be told of
          material changes. The policy is generated by the software from the operator's details, so
          it always describes the features this version has.
        </p>
      </Section>

      <Section id="contact" number={18} title="Contact and complaints">
        <p>
          Operator: <Placeholder op={op} field="legalName" />,{" "}
          <Placeholder op={op} field="address" />
          . Privacy requests: <OperatorEmail op={op} field="privacyEmail" />. General contact:{" "}
          <OperatorEmail op={op} field="contactEmail" />. If you are not satisfied with the
          operator's answer you may complain to the data protection authority where you live.
        </p>
      </Section>
    </LegalDoc>
  );
}
