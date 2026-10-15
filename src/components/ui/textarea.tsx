"use client";

import { useTranslations } from "next-intl";
import * as React from "react";
import { guardTextInput } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** Multi-line text, kept to the keyboard charset as you type (SPEC.md §6.6). */
export function Textarea({
  className,
  invalid,
  onChange,
  ...props
}: React.ComponentProps<"textarea"> & { invalid?: boolean }) {
  const t = useTranslations("ui");
  return (
    <textarea
      data-slot="textarea"
      aria-invalid={invalid || props["aria-invalid"]}
      title={t("inputCharset")}
      className={cn(
        "min-h-20 w-full rounded-md border border-input bg-surface-1 px-3 py-2 text-app-body text-ink transition-colors duration-150 outline-none placeholder:text-ink-tertiary focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-semantic-danger",
        className,
      )}
      {...props}
      onChange={guardTextInput(onChange)}
    />
  );
}
