import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/** Native select, styled like Input; options are passed as children. */
export function Select({
  className,
  invalid,
  children,
  ...props
}: React.ComponentProps<"select"> & { invalid?: boolean }) {
  return (
    <div className="relative">
      <select
        data-slot="select"
        aria-invalid={invalid || props["aria-invalid"]}
        className={cn(
          "h-8 w-full appearance-none rounded-md border border-input bg-surface-1 pr-8 pl-3 text-app-body text-ink transition-colors duration-150 outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-semantic-danger",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-2 size-4 -translate-y-1/2 text-ink-subtle"
        strokeWidth={1.5}
      />
    </div>
  );
}
