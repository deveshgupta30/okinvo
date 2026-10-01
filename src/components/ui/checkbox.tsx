import * as React from "react";
import { cn } from "@/lib/utils";

/** Native checkbox with a label; the accent colour is the only lavender on a form. */
export function Checkbox({
  className,
  label,
  description,
  id,
  ...props
}: React.ComponentProps<"input"> & { label: React.ReactNode; description?: React.ReactNode }) {
  const inputId = id ?? React.useId();
  return (
    <label htmlFor={inputId} className={cn("flex cursor-pointer items-start gap-2", className)}>
      <input
        id={inputId}
        type="checkbox"
        className="mt-[3px] size-4 shrink-0 rounded-sm border-input accent-primary focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
        {...props}
      />
      <span className="flex flex-col">
        <span className="text-app-body text-ink">{label}</span>
        {description ? (
          <span className="text-app-caption text-ink-subtle">{description}</span>
        ) : null}
      </span>
    </label>
  );
}
