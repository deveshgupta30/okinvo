import { Mail } from "lucide-react";
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

const STATUS: Record<DocumentDisplayStatus, { tone: Tone; label: string }> = {
  DRAFT: { tone: "neutral", label: "Draft" },
  ISSUED: { tone: "muted", label: "Issued" },
  SENT: { tone: "muted", label: "Sent" },
  PARTIALLY_PAID: { tone: "warning", label: "Partially paid" },
  PAID: { tone: "success", label: "Paid" },
  OVERDUE: { tone: "danger", label: "Overdue" },
  VOID: { tone: "danger", label: "Void" },
};

export function StatusPill({ status }: { status: DocumentDisplayStatus }) {
  const { tone, label } = STATUS[status];
  return (
    <Pill tone={tone} data-status={status}>
      {status === "SENT" ? <Mail aria-hidden className="size-3" strokeWidth={1.5} /> : null}
      {label}
    </Pill>
  );
}

export function ActivePill({ active, archived }: { active?: boolean; archived?: boolean }) {
  if (archived) return <Pill tone="neutral">Archived</Pill>;
  if (active === false) return <Pill tone="neutral">Inactive</Pill>;
  return <Pill tone="success">Active</Pill>;
}
