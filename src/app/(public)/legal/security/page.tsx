import type { Metadata } from "next";
import Link from "next/link";
import { LegalDoc, Section } from "@/components/legal/doc";
import { OperatorEmail, Placeholder } from "@/components/legal/placeholder";
import { getLegalOperator } from "@/server/dal/legal";

export const metadata: Metadata = {
  title: "Security",
  description:
    "How this okinvo instance protects data, and how to report a vulnerability responsibly.",
};

export const dynamic = "force-dynamic";

const SECTIONS = [
  { id: "model", title: "The security model in one paragraph" },
  { id: "transport", title: "Transport and browser protections" },
  { id: "auth", title: "Authentication, sessions and roles" },
  { id: "data", title: "Data protection at rest" },
  { id: "documents", title: "Document integrity" },
  { id: "input", title: "Input handling" },
  { id: "limits", title: "Rate limits and abuse controls" },
  { id: "supply", title: "Software supply chain and updates" },
  { id: "operations", title: "Operations: backups, logging, incidents" },
  { id: "disclosure", title: "Responsible disclosure" },
  { id: "operator", title: "What the operator is responsible for" },
];

export default async function SecurityPage() {
  const op = await getLegalOperator();
  return (
    <LegalDoc
      title="Security"
      effectiveDate={op.effectiveDate}
      sections={SECTIONS}
      summary={
        <>
          A plain summary of the protections built into okinvo and of the practices the operator,{" "}
          <Placeholder op={op} field="legalName" />, follows for this instance — and how to tell us
          about a weakness.
        </>
      }
    >
      <Section id="model" number={1} title="The security model in one paragraph">
        <p>
          okinvo is a self-contained web application that talks only to its own database and
          document store. Nothing in it is reachable without a session, an API key or a deliberately
          created public link, and the public pages expose only what a document recipient needs.
          Every state change is checked against the caller's role in the data layer, not just in the
          user interface, and is written to an audit log. Issued documents are immutable and
          verifiable by hash. The instance makes no outbound connections unless the operator
          configures one.
        </p>
      </Section>

      <Section id="transport" number={2} title="Transport and browser protections">
        <ul>
          <li>
            HTTPS everywhere, with HTTP Strict Transport Security; plain-HTTP requests are
            redirected.
          </li>
          <li>
            A strict Content Security Policy (<code className="font-mono">default-src 'self'</code>,
            scripts only with a per-request nonce, no inline event handlers, no external origins,
            <code className="font-mono"> frame-ancestors 'none'</code>).
          </li>
          <li>
            <code className="font-mono">X-Content-Type-Options</code>,{" "}
            <code className="font-mono">Referrer-Policy</code>,{" "}
            <code className="font-mono">Permissions-Policy</code> and other hardening headers on
            every response.
          </li>
          <li>
            Cross-site request forgery protection: same-origin checks on every state-changing
            request, SameSite cookies, and server actions bound to the origin.
          </li>
        </ul>
      </Section>

      <Section id="auth" number={3} title="Authentication, sessions and roles">
        <ul>
          <li>
            Sign-in through an identity provider the operator configured, or with a password hashed
            with a modern, salted algorithm. Only allow-listed or invited addresses can sign in.
          </li>
          <li>
            Sessions live in HttpOnly, SameSite cookies and expire after inactivity; owners can
            revoke every session of a user, and deactivation ends sessions immediately.
          </li>
          <li>
            Three roles (owner, editor, viewer) are enforced on every server action, route handler
            and API call. Settings, users and full exports are owner-only.
          </li>
          <li>
            API keys are shown once, stored hashed, carry the creator's role and can be revoked at
            any time; the MCP server can view, draft and issue but never delete.
          </li>
        </ul>
      </Section>

      <Section id="data" number={4} title="Data protection at rest">
        <ul>
          <li>
            Tax identifiers, bank and payment details, SMTP credentials, API keys and verification
            and share tokens are encrypted or hashed in the database with a key held only in the
            server's environment.
          </li>
          <li>Secrets are never written to the repository, container images or logs.</li>
          <li>
            Uploaded images are decoded and re-encoded on the way in, which strips metadata and
            active content; only PNG, JPEG, WebP and PDF are accepted, with size limits.
          </li>
          <li>
            Files in the document store are never publicly reachable; every download goes through an
            authenticated route or a token-gated public route.
          </li>
        </ul>
      </Section>

      <Section id="documents" number={5} title="Document integrity">
        <ul>
          <li>
            An issued invoice or credit note is frozen: the data, the template and the rendered PDF
            are stored and never changed. Corrections create new documents.
          </li>
          <li>
            Every stored PDF carries a SHA-256 hash recorded in the database; the public
            verification page lets a recipient compare their copy without uploading it.
          </li>
          <li>
            Numbers are allocated gap-free inside the issue transaction with row locks, so two
            documents never share a number.
          </li>
          <li>
            Password-protected copies are AES-256 encrypted with print-only permissions; share links
            serve those copies only, never the canonical file.
          </li>
        </ul>
      </Section>

      <Section id="input" number={6} title="Input handling">
        <ul>
          <li>
            Every input is validated with a schema at the server boundary, and every text field
            accepts only standard keyboard characters, so look-alike characters and control codes
            never enter the data.
          </li>
          <li>
            All database access is through parameterised queries; the application runs no shell
            commands.
          </li>
          <li>
            Spreadsheet exports neutralise formula injection (cells starting with =, +, - or @).
          </li>
          <li>
            Template settings are parameters only: no user-supplied HTML, CSS or fonts reach the
            renderer.
          </li>
        </ul>
      </Section>

      <Section id="limits" number={7} title="Rate limits and abuse controls">
        <p>
          Sign-in attempts, uploads, exports, e-mail sends, verification lookups, share-page views
          and share-password guesses are all rate-limited per address (and per link, where
          relevant). Public forms carry honeypot fields. Over-limit requests answer 429 with a retry
          time and are logged.
        </p>
      </Section>

      <Section id="supply" number={8} title="Software supply chain and updates">
        <ul>
          <li>
            Dependencies are pinned to exact versions, audited on every change, and scanned for
            known vulnerabilities (including the container image) on every pull request and weekly.
          </li>
          <li>
            The runtime container is minimal, runs as a non-root user with a read-only filesystem
            where possible, and ships no package manager.
          </li>
          <li>
            All fonts, scripts, styles and data are built into the image; the application works
            without internet access, and no third-party script runs in your browser.
          </li>
          <li>
            Security fixes are released as new images; the operator is responsible for deploying
            them.
          </li>
        </ul>
      </Section>

      <Section id="operations" number={9} title="Operations: backups, logging, incidents">
        <ul>
          <li>
            A documented backup and restore procedure with an automated restore drill; see the{" "}
            <Link href="/legal/data-retention" className="text-link">
              retention schedule
            </Link>{" "}
            for how long backups are kept.
          </li>
          <li>
            An append-only audit log of who did what; technical logs kept briefly and without
            secrets.
          </li>
          <li>
            If a personal data breach occurs, the operator will assess it, contain it, notify the
            supervisory authority and affected people where the law requires, and record what
            happened and what changed afterwards.
          </li>
        </ul>
      </Section>

      <Section id="disclosure" number={10} title="Responsible disclosure">
        <p>
          If you have found a security weakness in this instance or in okinvo itself, please tell us
          before telling anyone else. Write to <OperatorEmail op={op} field="contactEmail" /> with:
        </p>
        <ul>
          <li>what you found and where (URL, endpoint or component);</li>
          <li>steps to reproduce it, and what impact you believe it has;</li>
          <li>how we can reach you for questions.</li>
        </ul>
        <p>
          We will acknowledge your report within five working days, keep you informed, and credit
          you if you wish once a fix is out. Please do not access, modify or exfiltrate data that is
          not yours, do not degrade the service, and give us a reasonable time to fix the issue (we
          aim for 90 days) before public disclosure. Reports made in good faith under these rules
          will not lead to legal action by the operator. Issues in the okinvo software itself can
          also be reported to its maintainers through the project's security policy on GitHub.
        </p>
      </Section>

      <Section id="operator" number={11} title="What the operator is responsible for">
        <p>
          The software provides the controls above; the operator is responsible for the host it runs
          on, the TLS certificate, the database and storage credentials, the backup schedule,
          applying updates, choosing trustworthy e-mail and identity providers, and admitting the
          right people. The operator is <Placeholder op={op} field="legalName" />,{" "}
          <Placeholder op={op} field="address" />.
        </p>
      </Section>
    </LegalDoc>
  );
}
