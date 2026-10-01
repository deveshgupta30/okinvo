import * as React from "react";
import { cn } from "@/lib/utils";

/** Amounts: JetBrains Mono, medium, tabular, right-aligned by the caller (v2 §24.5). */
export function Amount({ className, ...props }: React.ComponentProps<"span">) {
  return <span className={cn("text-app-amount tabular-nums", className)} {...props} />;
}

/** Document numbers, dates, tokens and hashes. */
export function Mono({ className, ...props }: React.ComponentProps<"span">) {
  return <span className={cn("text-app-mono", className)} {...props} />;
}
