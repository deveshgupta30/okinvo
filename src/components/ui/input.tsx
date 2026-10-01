import * as React from "react";
import { cn } from "@/lib/utils";

export type InputProps = React.ComponentProps<"input"> & { invalid?: boolean };

export function Input({ className, invalid, type = "text", ...props }: InputProps) {
  return (
    <input
      type={type}
      data-slot="input"
      aria-invalid={invalid || props["aria-invalid"]}
      className={cn(
        "h-8 w-full min-w-0 rounded-md border border-input bg-surface-1 px-3 text-app-body text-ink transition-colors duration-150 outline-none placeholder:text-ink-tertiary focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-semantic-danger",
        type === "number" && "text-right font-mono tabular-nums",
        className,
      )}
      {...props}
    />
  );
}
