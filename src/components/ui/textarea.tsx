import * as React from "react";
import { cn } from "@/lib/utils";

export function Textarea({
  className,
  invalid,
  ...props
}: React.ComponentProps<"textarea"> & { invalid?: boolean }) {
  return (
    <textarea
      data-slot="textarea"
      aria-invalid={invalid || props["aria-invalid"]}
      className={cn(
        "min-h-20 w-full rounded-md border border-input bg-surface-1 px-3 py-2 text-app-body text-ink transition-colors duration-150 outline-none placeholder:text-ink-tertiary focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-semantic-danger",
        className,
      )}
      {...props}
    />
  );
}
