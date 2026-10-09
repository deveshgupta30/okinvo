import { Mail } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

export type Tone = "neutral" | "muted" | "success" | "warning" | "danger";

const TONE: Record<Tone, string> = {
  neutral: "bg-surface-2 text-ink-subtle",
  muted: "bg-surface-2 text-ink-muted",
  success: "bg-semantic-success/12 text-semantic-success",
  warning: "bg-semantic-warning/12 text-semantic-warning",
  danger: "bg-semantic-danger/12 text-semantic-danger",
};

export function Pill({
  tone = "neutral",
  className,
  children,
  ...props
}: React.ComponentProps<"span"> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center gap-1 rounded-pill px-2 text-app-caption whitespace-nowrap",
        TONE[tone],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}

/** Invoice / credit-note display status → status palette (v2 §24.5). */
export type DocumentDisplayStatus =
  "DRAFT" | "ISSUED" | "SENT" | "PARTIALLY_PAID" | "PAID" | "OVERDUE" | "VOID";

/** Labels come from the `ui.statusPill` catalogue namespace, keyed by the status itself. */
const STATUS_TONE: Record<DocumentDisplayStatus, Tone> = {
  DRAFT: "neutral",
  ISSUED: "muted",
  SENT: "muted",
  PARTIALLY_PAID: "warning",
  PAID: "success",
  OVERDUE: "danger",
  VOID: "danger",
};

export function StatusPill({ status }: { status: DocumentDisplayStatus }) {
  const t = useTranslations("ui.statusPill");
  return (
    <Pill tone={STATUS_TONE[status]} data-status={status}>
      {status === "SENT" ? <Mail aria-hidden className="size-3" strokeWidth={1.5} /> : null}
      {t(status)}
    </Pill>
  );
}

export function ActivePill({ active, archived }: { active?: boolean; archived?: boolean }) {
  const t = useTranslations("ui.activePill");
  if (archived) return <Pill tone="neutral">{t("archived")}</Pill>;
  if (active === false) return <Pill tone="neutral">{t("inactive")}</Pill>;
  return <Pill tone="success">{t("active")}</Pill>;
}
