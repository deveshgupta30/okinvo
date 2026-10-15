"use client";

import * as React from "react";
import {
  Tooltip as BeuiTooltip,
  TooltipContent as BeuiTooltipContent,
  TooltipProvider as BeuiTooltipProvider,
  TooltipTrigger as BeuiTooltipTrigger,
} from "@/components/motion/tooltip";
import { cn } from "@/lib/utils";

/** The beui tooltip behind the names the app already uses (provider, root, trigger, content). */
export const TooltipProvider = BeuiTooltipProvider;
export const Tooltip = BeuiTooltip;
export const TooltipTrigger = BeuiTooltipTrigger;

export function TooltipContent({
  className,
  sideOffset = 6,
  ...props
}: React.ComponentProps<typeof BeuiTooltipContent>) {
  return (
    <BeuiTooltipContent
      sideOffset={sideOffset}
      className={cn(
        "rounded-md border border-hairline-strong bg-surface-3 px-2 py-1 text-app-caption text-ink",
        className,
      )}
      {...props}
    />
  );
}
