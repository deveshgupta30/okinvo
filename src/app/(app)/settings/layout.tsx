import { SettingsPanel } from "@/components/settings/settings-panel";
import { SettingsNav } from "@/components/settings-nav";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SettingsNav />
      <SettingsPanel>{children}</SettingsPanel>
    </>
  );
}
