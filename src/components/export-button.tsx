import { ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { buttonVariants } from "@/components/ui/button";
import type { DatasetId } from "@/lib/exports/types";
import { cn } from "@/lib/utils";

/**
 * The Export control every index page carries (SPEC §4.11): a format menu whose links go to
 * `/api/exports/<dataset>` with the page's current filters. A `<details>` menu needs no client
 * JavaScript, so it works inside server components and before hydration.
 */
export function ExportButton({
  dataset,
  params = {},
  className,
}: {
  dataset: DatasetId;
  params?: Record<string, string | string[] | undefined>;
  className?: string | undefined;
}) {
  const t = useTranslations("exports");
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (typeof v === "string" && v && k !== "page" && k !== "format" && k !== "flash") q.set(k, v);
  }
  const href = (format: "csv" | "xlsx") => {
    const p = new URLSearchParams(q);
    p.set("format", format);
    return `/api/exports/${dataset}?${p.toString()}`;
  };
  return (
    <details className={cn("group relative", className)}>
      <summary
        className={cn(
          buttonVariants({ variant: "secondary" }),
          "cursor-pointer list-none select-none [&::-webkit-details-marker]:hidden",
        )}
      >
        {t("export")}
        <ChevronDown aria-hidden className="transition-transform group-open:rotate-180" />
      </summary>
      <div
        role="menu"
        className="absolute right-0 z-20 mt-1 min-w-40 rounded-md border border-hairline-strong bg-surface-2 p-1 text-ink shadow-lg"
      >
        <a
          role="menuitem"
          href={href("csv")}
          className="block rounded-sm px-2 py-1.5 text-app-body hover:bg-surface-1"
        >
          {t("csv")}
        </a>
        <a
          role="menuitem"
          href={href("xlsx")}
          className="block rounded-sm px-2 py-1.5 text-app-body hover:bg-surface-1"
        >
          {t("xlsx")}
        </a>
      </div>
    </details>
  );
}
