import type { Metadata } from "next";
import Link from "next/link";
import { LegalOperatorForm } from "@/components/settings/legal-operator-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Pill } from "@/components/ui/status-pill";
import { LEGAL_FIELD_LABELS, missingLegalFields } from "@/lib/schemas/legal-operator";
import { requireOwner } from "@/server/auth";
import { getLegalOperator } from "@/server/dal/legal";

export const metadata: Metadata = {
  title: "Legal",
  description: "Who operates this instance: the details printed on the public legal pages.",
};

const PAGES = [
  ["/legal/terms", "Terms of Service"],
  ["/legal/acceptable-use", "Acceptable Use Policy"],
  ["/legal/privacy", "Privacy Policy"],
  ["/legal/cookies", "Cookie Policy"],
  ["/legal/data-retention", "Data retention"],
  ["/legal/security", "Security"],
  ["/legal/licenses", "Licences and third-party notices"],
] as const;

export default async function LegalSettingsPage() {
  await requireOwner();
  const op = await getLegalOperator();
  const missing = missingLegalFields(op);
  return (
    <>
      <PageHeader
        title="Legal"
        description="The public legal pages print these details. Until every field is filled, the pages show highlighted placeholders."
      />
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center gap-3">
              <CardTitle>Operator details</CardTitle>
              {missing.length === 0 ? (
                <Pill tone="success">Complete</Pill>
              ) : (
                <Pill tone="warning">
                  {missing.length} missing: {missing.map((m) => LEGAL_FIELD_LABELS[m]).join(", ")}
                </Pill>
              )}
            </div>
            <CardDescription>
              You, as the person or company running this instance, are the operator the documents
              refer to. Nothing here is sent anywhere; it is printed on the pages below.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <LegalOperatorForm initial={op} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Public pages</CardTitle>
              <CardDescription>
                Linked from the sign-in page, the share viewer and the cookie notice.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-2 sm:grid-cols-2">
              {PAGES.map(([href, label]) => (
                <li key={href}>
                  <Link href={href} className="text-link underline-offset-4 hover:underline">
                    {label}
                  </Link>{" "}
                  <span className="app-mono text-app-caption text-ink-tertiary">{href}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
