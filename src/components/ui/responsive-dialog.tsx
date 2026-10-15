"use client";

import { useTranslations } from "next-intl";
import * as React from "react";
import { BottomSheet } from "@/components/motion/bottom-sheet";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useIsMobile } from "@/lib/is-mobile";
import { cn } from "@/lib/utils";

/**
 * A modal that is a centred dialog from `md` up and beui's draggable bottom sheet below it
 * (addendum §3: confirm dialogs and the share dialog on phones). Controlled: the trigger lives
 * with the caller, so the same button opens either surface.
 */
export function ResponsiveDialog({
  open,
  onOpenChange,
  title,
  description,
  className,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string | undefined;
  className?: string;
  children: React.ReactNode;
}) {
  const tu = useTranslations("ui");
  const isMobile = useIsMobile();
  if (isMobile) {
    return (
      <BottomSheet
        closeLabel={tu("close")}
        open={open}
        onOpenChange={onOpenChange}
        title={title}
        {...(description ? { description } : {})}
        snapPoints={["auto", 0.92]}
        className="border-hairline bg-surface-1 text-ink"
      >
        <div data-sheet className={cn("flex flex-col gap-4 px-4 pb-6", className)}>
          {children}
        </div>
      </BottomSheet>
    );
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={className}>
        <DialogTitle>{title}</DialogTitle>
        {description ? <DialogDescription>{description}</DialogDescription> : null}
        {children}
      </DialogContent>
    </Dialog>
  );
}
