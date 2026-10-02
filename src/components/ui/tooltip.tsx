"use client";

import * as React from "react";
import { Tooltip as Radix } from "radix-ui";
import { cn } from "@/lib/utils";

export const TooltipProvider = Radix.Provider;
export const Tooltip = Radix.Root;
export const TooltipTrigger = Radix.Trigger;

export function TooltipContent({
  className,
  sideOffset = 6,
  ...props
}: React.ComponentProps<typeof Radix.Content>) {
  return (
    <Radix.Portal>
      <Radix.Content
        sideOffset={sideOffset}
        className={cn(
          "z-50 rounded-md border border-hairline-strong bg-surface-3 px-2 py-1 text-app-caption text-ink data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0",
          className,
        )}
        {...props}
      />
    </Radix.Portal>
  );
}
