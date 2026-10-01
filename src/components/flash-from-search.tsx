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
  const raw = params.get("flash");
  // Derived state: a new raw value replaces the shown flash during render (not in an effect).
  const [shown, setShown] = useState<{ raw: string | null; flash: Flash | null }>({
    raw: null,
    flash: null,
  });
  if (raw && raw !== shown.raw) setShown({ raw, flash: readFlash(raw) });

  useEffect(() => {
    if (!raw) return;
    const rest = new URLSearchParams(params.toString());
    rest.delete("flash");
    const qs = rest.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    const t = setTimeout(() => setShown((s) => ({ ...s, flash: null })), 6000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run only when the raw flash changes
  }, [raw]);

  const flash = shown.flash;
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
        onClick={() => setShown((s) => ({ ...s, flash: null }))}
      >
        <X className="size-4" strokeWidth={1.5} />
      </button>
    </div>
  );
}
