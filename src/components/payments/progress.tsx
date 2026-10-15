"use client";

import { Check } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useTranslations } from "next-intl";
import { Mono } from "@/components/ui/mono";
import { formatDate, formatMoney } from "@/lib/format";
import type { Checkpoint } from "@/lib/payments/progress";
import { cn } from "@/lib/utils";

/**
 * The invoice page's "Payment progress" checklist (addendum §4), in the style of beui's todo
 * list: a tick that springs in and a label that strikes through as each checkpoint is met. The
 * states come from `paymentCheckpoints`; every string is translated, which is why this is
 * okinvo's own component rather than the vendored block.
 */
export function PaymentProgress({
  steps,
  currency,
  locale,
}: {
  steps: Checkpoint[];
  currency: string;
  locale: string;
}) {
  const t = useTranslations("invoices.detail.progress");
  const reduce = useReducedMotion();
  const label = (s: Checkpoint) => {
    if (s.key === "payment" && s.amount && s.date) {
      return t.rich("paymentOn", {
        amount: formatMoney(s.amount, currency, locale),
        date: formatDate(s.date, locale),
        mono: (chunks) => <Mono>{chunks}</Mono>,
      });
    }
    return t(s.key);
  };
  return (
    <ol data-payment-progress className="flex flex-col gap-2">
      {steps.map((s) => (
        <li
          key={s.id}
          data-checkpoint={s.key}
          data-done={s.done ? "true" : "false"}
          className="flex items-center gap-3 text-app-body"
        >
          <span
            aria-hidden
            className={cn(
              "flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors duration-200",
              s.done
                ? "border-primary bg-primary text-on-primary"
                : "border-hairline-strong bg-surface-1",
            )}
          >
            {s.done ? (
              <motion.span
                initial={reduce ? false : { scale: 0.4, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 500, damping: 28 }}
                className="flex"
              >
                <Check className="size-3" strokeWidth={2.5} />
              </motion.span>
            ) : null}
          </span>
          <span className="relative min-w-0 flex-1">
            <span
              className={cn(
                "transition-colors duration-200",
                s.done ? "text-ink-subtle" : "text-ink",
              )}
            >
              {label(s)}
            </span>
            <motion.span
              aria-hidden
              initial={false}
              animate={{ scaleX: s.done ? 1 : 0 }}
              transition={
                reduce ? { duration: 0 } : { type: "spring", stiffness: 260, damping: 30 }
              }
              className="pointer-events-none absolute top-1/2 left-0 h-px w-full origin-left bg-ink-subtle"
            />
          </span>
          <span className="sr-only">{s.done ? t("done") : t("pending")}</span>
        </li>
      ))}
    </ol>
  );
}
