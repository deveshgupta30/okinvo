import type { Metadata } from "next";
import { LegalDoc, Section } from "@/components/legal/doc";
import { APP_COOKIES } from "@/lib/cookies";

export const metadata: Metadata = {
  title: "Cookie policy",
  description: "The cookies this okinvo instance sets, why, and for how long.",
};

const SECTIONS = [
  { id: "what", title: "What cookies are" },
  { id: "which", title: "Which cookies this site sets" },
  { id: "why-no-consent", title: "Why there is no consent banner" },
  { id: "control", title: "How to control them" },
  { id: "changes", title: "Changes to this policy" },
];

/** Generated from the same list the app uses, so it can never drift from what is set. */
export default function CookiePolicyPage() {
  return (
    <LegalDoc
      title="Cookie policy"
      summary="This site sets only the cookies it needs to work. There are no analytics, advertising or tracking cookies, and nothing is shared with third parties."
      sections={SECTIONS}
    >
      <Section id="what" number={1} title="What cookies are">
        <p>
          A cookie is a small piece of text a website stores in your browser so that the next
          request can be recognised. okinvo uses cookies for one thing only: to keep you signed in
          and to remember how you like the app to look.
        </p>
      </Section>
      <Section id="which" number={2} title="Which cookies this site sets">
        <p>Every cookie okinvo can set, with its purpose and lifetime:</p>
        <table className="w-full border-collapse text-left text-app-caption">
          <thead>
            <tr className="border-b border-hairline text-ink">
              <th className="py-2 pr-4">Name</th>
              <th className="py-2 pr-4">Purpose</th>
              <th className="py-2 pr-4">Lifetime</th>
              <th className="py-2">Category</th>
            </tr>
          </thead>
          <tbody>
            {APP_COOKIES.map((c) => (
              <tr key={c.name} className="border-b border-hairline align-top">
                <td className="py-2 pr-4 font-mono text-app-mono text-ink">{c.name}</td>
                <td className="py-2 pr-4">{c.purpose}</td>
                <td className="py-2 pr-4">{c.lifetime}</td>
                <td className="py-2">Strictly necessary</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p>
          All of them are first-party (sent only to this site) and marked{" "}
          <strong>SameSite=Lax</strong>; the session cookie is also <strong>HttpOnly</strong> and,
          over HTTPS, <strong>Secure</strong>.
        </p>
      </Section>
      <Section id="why-no-consent" number={3} title="Why there is no consent banner">
        <p>
          Privacy law (the ePrivacy rules in the EU and UK, and similar laws elsewhere) requires
          consent for cookies that are not strictly necessary for a service you asked for. Every
          cookie above is necessary for signing in or for a preference you chose yourself, so the
          notice you see on first visit is informational: it tells you what is set and links here.
        </p>
      </Section>
      <Section id="control" number={4} title="How to control them">
        <ul>
          <li>Signing out removes the session cookie.</li>
          <li>
            Your browser lets you view and delete cookies for this site at any time; deleting them
            signs you out and resets your display preferences.
          </li>
          <li>
            Blocking cookies entirely stops you from signing in, because the session cannot be kept
            without one.
          </li>
          <li>Signed-in users can show the notice again from Settings → Account → Privacy.</li>
        </ul>
      </Section>
      <Section id="changes" number={5} title="Changes to this policy">
        <p>
          This page is generated from the list of cookies built into the software, so it changes
          only when a new version of okinvo adds or removes a cookie. The operator of this instance
          does not add cookies of their own.
        </p>
      </Section>
    </LegalDoc>
  );
}
