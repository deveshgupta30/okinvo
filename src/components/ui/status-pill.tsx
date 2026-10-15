"use client";

import { Mail } from "lucide-react";
import { useTranslations } from "next-intl";
import { AnimatedBadge, type AnimatedBadgeStatus } from "@/components/motion/animated-badge";
import { cn } from "@/lib/utils";

export type Tone = "neutral" | "muted" | "success" | "warning" | "danger";

/** Status palette (v2 §24.5): the tone classes replace beui's own palette on the badge. */
const TONE: Record<Tone, string> = {
  neutral: "border-transparent bg-surface-2 text-ink-subtle",
  muted: "border-transparent bg-surface-2 text-ink-muted",
  success: "border-transparent bg-semantic-success/12 text-semantic-success",
  warning: "border-transparent bg-semantic-warning/12 text-semantic-warning",
  danger: "border-transparent bg-semantic-danger/12 text-semantic-danger",
};
const BADGE_STATUS: Record<Tone, AnimatedBadgeStatus> = {
  neutral: "neutral",
  muted: "neutral",
  success: "success",
  warning: "warning",
  danger: "danger",
};

export function Pill({
  tone = "neutral",
  className,
  children,
  ...props
}: React.ComponentProps<"span"> & { tone?: Tone }) {
  return (
    <AnimatedBadge
      status={BADGE_STATUS[tone]}
      size="sm"
      showIcon={false}
      {...(typeof children === "string" ? { contentKey: children } : {})}
      className={cn(
        "inline-flex h-5 items-center gap-1 rounded-pill px-2 text-app-caption whitespace-nowrap",
        TONE[tone],
        className,
      )}
      {...(props as Record<string, unknown>)}
    >
      {children}
    </AnimatedBadge>
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
