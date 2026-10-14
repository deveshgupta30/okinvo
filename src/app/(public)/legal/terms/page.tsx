import type { Metadata } from "next";
import Link from "next/link";
import { LegalDoc, Section } from "@/components/legal/doc";
import { OperatorEmail, Placeholder } from "@/components/legal/placeholder";
import { getLegalOperator } from "@/server/dal/legal";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The terms under which the operator of this okinvo instance provides it to you.",
};

export const dynamic = "force-dynamic";

const SECTIONS = [
  { id: "acceptance", title: "Acceptance of these terms" },
  { id: "service", title: "The service" },
  { id: "accounts", title: "Accounts and roles" },
  { id: "acceptable-use", title: "Acceptable use" },
  { id: "content", title: "Your content and invoices" },
  { id: "availability", title: "Availability, backups and changes to the service" },
  { id: "fees", title: "Fees" },
  { id: "third-party", title: "Third-party services the operator has configured" },
  { id: "warranties", title: "Warranties and disclaimer" },
  { id: "liability", title: "Limitation of liability" },
  { id: "indemnity", title: "Indemnity" },
  { id: "termination", title: "Suspension and termination" },
  { id: "changes", title: "Changes to these terms" },
  { id: "law", title: "Governing law and venue" },
  { id: "general", title: "General" },
  { id: "contact", title: "Contact" },
];

export default async function TermsPage() {
  const op = await getLegalOperator();
  return (
    <LegalDoc
      title="Terms of Service"
      effectiveDate={op.effectiveDate}
      sections={SECTIONS}
      summary={
        <>
          okinvo is self-hosted invoicing software. This instance is operated by{" "}
          <Placeholder op={op} field="legalName" /> (the <strong>operator</strong>, "we", "us"),{" "}
          <Placeholder op={op} field="entityType" /> established at{" "}
          <Placeholder op={op} field="address" />, <Placeholder op={op} field="country" />. These
          terms govern your use of this instance. Please read them; they limit our liability and set
          out what you may and may not do.
        </>
      }
    >
      <Section id="acceptance" number={1} title="Acceptance of these terms">
        <p>
          By signing in to this instance, or by using an API key, a share link or any other access
          it gives you, you agree to these Terms of Service, the{" "}
          <Link href="/legal/acceptable-use" className="text-link">
            Acceptable Use Policy
          </Link>{" "}
          and the{" "}
          <Link href="/legal/privacy" className="text-link">
            Privacy Policy
          </Link>
          , which together form the agreement between you and the operator. If you use the service
          on behalf of a business, you confirm that you are authorised to bind that business, and
          "you" means the business as well as the person using it.
        </p>
        <p>
          If you do not agree, do not sign in. Nothing in these terms affects rights you have under
          law that cannot be excluded by agreement.
        </p>
      </Section>

      <Section id="service" number={2} title="The service">
        <p>
          The service is a private installation of okinvo, an open-source invoicing application
          (Apache License 2.0) that lets an independent professional or small business keep clients,
          services and products, build and issue invoices and credit notes, record payments, send
          documents by e-mail, and export records. The operator runs the software on infrastructure
          the operator controls; the authors of okinvo are not party to this agreement and do not
          operate this instance.
        </p>
        <p>
          The service is provided to the people the operator has invited: the operator's own
          accounts and the editors and viewers the operator adds. It is not offered to the public at
          large, and the operator may decline to admit anyone.
        </p>
        <p>
          Public pages - the document verification page and share links - are available to anyone
          who holds the corresponding link. Those visitors are bound by these terms only to the
          extent they use the page: they may view and download what the link exposes and nothing
          else.
        </p>
      </Section>

      <Section id="accounts" number={3} title="Accounts and roles">
        <ul>
          <li>
            <strong>Admission.</strong> Only e-mail addresses the operator has allowed can sign in.
            Sign-in happens through an identity provider the operator configured or, where the
            operator enabled it, a password you set yourself.
          </li>
          <li>
            <strong>Roles.</strong> An <strong>owner</strong> can do everything, including changing
            settings, managing users and exporting all data. An <strong>editor</strong> can create
            and issue documents, record payments and send e-mail. A <strong>viewer</strong> can read
            and download. The operator assigns roles and may change or revoke them at any time.
          </li>
          <li>
            <strong>Your credentials.</strong> Keep your password, session and API keys to yourself.
            Everything done with them is treated as done by you. Tell the operator at once if you
            believe a credential has been exposed; owners can revoke sessions and keys.
          </li>
          <li>
            <strong>Accuracy.</strong> Keep your account details (name, e-mail) accurate so the
            operator can reach you.
          </li>
        </ul>
      </Section>

      <Section id="acceptable-use" number={4} title="Acceptable use">
        <p>
          You must use the service lawfully and in line with the{" "}
          <Link href="/legal/acceptable-use" className="text-link">
            Acceptable Use Policy
          </Link>
          . In short: no fraudulent or misleading documents, no attempts to get around access
          controls or rate limits, no security testing without the operator's written consent, no
          malware, and no use of the API, the MCP server or share links to collect data you are not
          entitled to.
        </p>
      </Section>

      <Section id="content" number={5} title="Your content and invoices">
        <p>
          <strong>You own your content.</strong> The clients, line items, notes, documents,
          attachments and other material you enter ("content") stay yours. You grant the operator
          only what is needed to run the service for you: to store the content, render it into
          documents, e-mail it where you ask, back it up and restore it, and show it to the users
          you authorised.
        </p>
        <p>
          <strong>You are responsible for your content.</strong> That includes the accuracy of the
          invoices you issue, the tax you charge, the numbering rules you configure, and your
          compliance with the invoicing, tax and record-keeping laws that apply to you (for example
          GST rules in India or VAT rules in the UK). okinvo helps you compute and present these
          things; it does not give tax or legal advice, and the operator does not check your
          documents for you.
        </p>
        <p>
          <strong>Issued documents are immutable.</strong> Once an invoice or credit note is issued
          it cannot be edited; corrections are made by voiding, re-issuing or crediting, and every
          stored PDF keeps its hash for verification. This is a feature of the software and a
          condition of its use.
        </p>
        <p>
          <strong>Personal data of your clients.</strong> You decide what client data to enter and
          you are the party responsible for having a lawful basis to hold it. The operator processes
          it on your behalf as described in the Privacy Policy.
        </p>
      </Section>

      <Section
        id="availability"
        number={6}
        title="Availability, backups and changes to the service"
      >
        <p>
          The operator aims to keep the service available but gives no guarantee of uptime. The
          service may be unavailable for maintenance, upgrades, outages of the operator's
          infrastructure or circumstances beyond the operator's control. The operator may change,
          upgrade, limit or discontinue features at any time; where a change would remove your
          access to your data, the operator will give you a reasonable opportunity to export it.
        </p>
        <p>
          okinvo includes a documented backup and restore procedure. Whether and how often backups
          are taken, and how long they are kept, is the operator's decision; see the{" "}
          <Link href="/legal/data-retention" className="text-link">
            data retention schedule
          </Link>
          . You should keep your own copies of important documents using the export functions.
        </p>
      </Section>

      <Section id="fees" number={7} title="Fees">
        <p>
          Unless the operator has agreed otherwise with you in writing, the service is provided
          without charge. The operator may introduce fees for the future only on reasonable notice,
          and never for access to data you already entered during the notice period.
        </p>
      </Section>

      <Section id="third-party" number={8} title="Third-party services the operator has configured">
        <p>
          okinvo runs without external services. The operator may nevertheless connect it to
          services the operator chose, each governed by that provider's own terms:
        </p>
        <ul>
          <li>
            an <strong>SMTP server</strong> to send invoices by e-mail - messages you send pass
            through it;
          </li>
          <li>
            an <strong>S3-compatible object store</strong> for documents and attachments instead of
            local disk;
          </li>
          <li>
            an <strong>identity provider</strong> (such as Google, GitHub, Keycloak or Casdoor) for
            sign-in - that provider sees that you signed in and shares your name, e-mail and picture
            with the service;
          </li>
          <li>
            an <strong>exchange-rate source</strong>, only if the operator enabled online rates.
          </li>
        </ul>
        <p>
          The operator is responsible for choosing these providers. The Privacy Policy explains what
          each receives.
        </p>
      </Section>

      <Section id="warranties" number={9} title="Warranties and disclaimer">
        <p>
          The service and the software are provided <strong>"as is"</strong> and{" "}
          <strong>"as available"</strong>, without warranties of any kind, express or implied,
          including warranties of merchantability, fitness for a particular purpose, title,
          non-infringement, accuracy and uninterrupted or error-free operation. In particular:
        </p>
        <ul>
          <li>
            calculations (totals, taxes, rounding, amounts in words, currency conversions) are
            provided for your convenience; you must check them before relying on them;
          </li>
          <li>exchange rates, where shown, are indicative, dated, and not a quotation;</li>
          <li>
            e-invoicing and other regulatory outputs are generated to published formats but their
            acceptance by any authority is not guaranteed;
          </li>
          <li>the operator does not warrant that the service meets your legal obligations.</li>
        </ul>
        <p>
          Some jurisdictions do not allow certain warranty exclusions; in that case the exclusions
          apply to the fullest extent the law allows.
        </p>
      </Section>

      <Section id="liability" number={10} title="Limitation of liability">
        <p>
          To the fullest extent permitted by law, the operator is not liable to you for any
          indirect, incidental, special, consequential or punitive damages, or for lost profits,
          lost revenue, lost data, business interruption or the cost of substitute services, arising
          out of or in connection with the service, however caused and under any theory of
          liability, even if advised of the possibility.
        </p>
        <p>
          To the same extent, the operator's total liability for all claims relating to the service
          in any twelve-month period is limited to the greater of (a) the fees you paid for the
          service in that period and (b) one hundred units of the currency of the operator's
          country.
        </p>
        <p>
          Nothing in these terms limits liability for death or personal injury caused by negligence,
          for fraud, or for anything else that cannot be limited by law.
        </p>
      </Section>

      <Section id="indemnity" number={11} title="Indemnity">
        <p>
          You will defend and indemnify the operator against claims, losses and reasonable costs
          (including legal fees) arising from your content, your invoices and the tax treatment in
          them, your breach of these terms or of the Acceptable Use Policy, or your violation of law
          or of a third party's rights.
        </p>
      </Section>

      <Section id="termination" number={12} title="Suspension and termination">
        <ul>
          <li>
            The operator may suspend or deactivate your account at any time if you breach these
            terms, if required by law, or if the operator stops running the service. Deactivation
            ends your sessions and API keys immediately.
          </li>
          <li>
            You may stop using the service at any time and ask the operator to deactivate your
            account. Documents you issued stay in the records because they are the operator's
            business records and may be required by law to be kept; see the retention schedule.
          </li>
          <li>
            Sections 5 (content), 9 (warranties), 10 (liability), 11 (indemnity), 14 (law) and 15
            (general) survive termination.
          </li>
        </ul>
      </Section>

      <Section id="changes" number={13} title="Changes to these terms">
        <p>
          The operator may update these terms. The effective date at the top changes when they do,
          and the operator will tell signed-in users of material changes by a notice in the app or
          by e-mail. Continuing to use the service after the effective date means you accept the
          updated terms; if you do not, stop using the service and export your data.
        </p>
      </Section>

      <Section id="law" number={14} title="Governing law and venue">
        <p>
          These terms are governed by <Placeholder op={op} field="governingLaw" />, without regard
          to conflict-of-law rules. Disputes that cannot be settled amicably are subject to the
          exclusive jurisdiction of <Placeholder op={op} field="venue" />, except that either party
          may seek injunctive relief in any competent court, and except where mandatory consumer law
          gives you the right to bring proceedings where you live.
        </p>
      </Section>

      <Section id="general" number={15} title="General">
        <ul>
          <li>
            <strong>Entire agreement.</strong> These terms, the Acceptable Use Policy and the
            Privacy Policy are the whole agreement about the service and replace earlier
            understandings.
          </li>
          <li>
            <strong>Severability.</strong> If a provision is unenforceable, the rest stays in force
            and the provision is applied to the extent allowed.
          </li>
          <li>
            <strong>No waiver.</strong> Not enforcing a provision is not a waiver of it.
          </li>
          <li>
            <strong>Assignment.</strong> You may not assign this agreement; the operator may assign
            it to a successor who runs the service.
          </li>
          <li>
            <strong>Open source.</strong> okinvo itself is licensed under the Apache License 2.0;
            see{" "}
            <Link href="/legal/licenses" className="text-link">
              licences
            </Link>
            . These terms cover the operator's instance, not the software's licence.
          </li>
          <li>
            <strong>Language.</strong> These terms are written in English; translations are for
            convenience and the English text prevails.
          </li>
        </ul>
      </Section>

      <Section id="contact" number={16} title="Contact">
        <p>
          Questions about these terms go to the operator: <Placeholder op={op} field="legalName" />
          , <Placeholder op={op} field="address" />, e-mail{" "}
          <OperatorEmail op={op} field="contactEmail" />.
        </p>
      </Section>
    </LegalDoc>
  );
}
