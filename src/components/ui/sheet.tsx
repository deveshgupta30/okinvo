"use client";

import * as React from "react";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Dialog as Radix } from "radix-ui";
import { cn } from "@/lib/utils";

/** A dialog that slides in from the left edge (plan v2 §24.6 "sheet / drawer", 200 ms). */
export const Sheet = Radix.Root;
export const SheetTrigger = Radix.Trigger;
export const SheetClose = Radix.Close;
export const SheetTitle = Radix.Title;
export const SheetDescription = Radix.Description;

export function SheetContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof Radix.Content>) {
  const t = useTranslations("ui");
  return (
    <Radix.Portal>
      <Radix.Overlay className="fixed inset-0 z-50 bg-semantic-overlay/70 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0 motion-reduce:animate-none" />
      <Radix.Content
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex h-dvh w-[280px] max-w-[85vw] flex-col border-r border-hairline-strong bg-surface-1 text-ink duration-200 ease-out outline-none data-[state=closed]:animate-out data-[state=closed]:slide-out-to-left data-[state=open]:animate-in data-[state=open]:slide-in-from-left motion-reduce:animate-none",
          className,
        )}
        {...props}
      >
        {children}
        <Radix.Close
          className="absolute top-3 right-3 rounded-sm p-1 text-ink-subtle hover:text-ink focus-visible:ring-2 focus-visible:ring-ring/50"
          aria-label={t("closeMenu")}
        >
          <X className="size-4" strokeWidth={1.5} />
        </Radix.Close>
      </Radix.Content>
    </Radix.Portal>
  );
}
