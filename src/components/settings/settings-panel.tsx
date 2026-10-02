"use client";

import { usePathname } from "next/navigation";

/** Re-mounts the tab content on route change so it fades and slides in (150 ms, reduced-motion safe). */
export function SettingsPanel({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div
      key={pathname}
      className="animate-in duration-150 ease-out fade-in-0 slide-in-from-bottom-1 motion-reduce:animate-none"
    >
      {children}
    </div>
  );
}
