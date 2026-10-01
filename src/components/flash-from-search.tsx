"use client";

import { X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { readFlash, type Flash } from "@/lib/flash";
import { cn } from "@/lib/utils";

const RAIL: Record<Flash["kind"], string> = {
  success: "border-l-semantic-success",
  error: "border-l-semantic-danger",
  info: "border-l-primary",
};

/** Toast rendered from `?flash=`; strips the parameter so a reload does not repeat it. */
export function FlashFromSearch() {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const [flash, setFlash] = useState<Flash | null>(null);
  const raw = params.get("flash");

  useEffect(() => {
    const next = readFlash(raw);
    if (!next) return;
    setFlash(next);
    const rest = new URLSearchParams(params.toString());
    rest.delete("flash");
    const qs = rest.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    const t = setTimeout(() => setFlash(null), 6000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run only when the raw flash changes
  }, [raw]);

  if (!flash) return null;
  return (
    <div
      role={flash.kind === "error" ? "alert" : "status"}
      className={cn(
        "fixed right-6 bottom-6 z-50 flex max-w-sm items-start gap-3 rounded-md border border-l-[3px] border-hairline-strong bg-surface-2 px-4 py-3 text-app-body text-ink",
        RAIL[flash.kind],
      )}
    >
      <span className="flex-1">{flash.message}</span>
      <button
        type="button"
        aria-label="Dismiss"
        className="text-ink-subtle hover:text-ink"
        onClick={() => setFlash(null)}
      >
        <X className="size-4" strokeWidth={1.5} />
      </button>
    </div>
  );
}
