import { SettingsPanel } from "@/components/settings/settings-panel";
import { SettingsNav } from "@/components/settings-nav";
import { optionalUser } from "@/server/auth";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const actor = await optionalUser();
  return (
    <>
      <SettingsNav role={actor?.role ?? "VIEWER"} />
      <SettingsPanel>{children}</SettingsPanel>
    </>
  );
}
