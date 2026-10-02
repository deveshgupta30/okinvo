import type { Metadata } from "next";
import { AccentPicker } from "@/components/settings/accent-picker";
import { ThemeChoice } from "@/components/settings/theme-choice";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireOwner } from "@/server/auth";
import { getAccount } from "@/server/dal/users";

export const metadata: Metadata = { title: "Appearance" };

export default async function AppearancePage() {
  const actor = await requireOwner();
  const account = await getAccount(actor);
  return (
    <>
      <PageHeader
        title="Appearance"
        description="Theme and accent colour, saved to your account."
      />
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Theme</CardTitle>
              <CardDescription>Follow the system, or pin light or dark.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <ThemeChoice initial={account.theme} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Accent</CardTitle>
              <CardDescription>
                Used for the primary button, focus rings and the active page marker. Mint matches
                the brand mark.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <AccentPicker initial={account.accent} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
