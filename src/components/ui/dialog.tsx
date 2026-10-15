"use client";

import * as React from "react";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Dialog as RadixDialog } from "radix-ui";
import { cn } from "@/lib/utils";

export const Dialog = RadixDialog.Root;
export const DialogTrigger = RadixDialog.Trigger;
export const DialogClose = RadixDialog.Close;

export function DialogContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof RadixDialog.Content>) {
  const t = useTranslations("ui");
  return (
    <RadixDialog.Portal>
      <RadixDialog.Overlay className="fixed inset-0 z-50 bg-semantic-overlay data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
      <RadixDialog.Content
        className={cn(
          "fixed top-1/2 left-1/2 z-50 flex w-full max-w-md -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-lg border border-hairline-strong bg-surface-2 p-6 text-ink duration-200 outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
          className,
        )}
        {...props}
      >
        {children}
        <RadixDialog.Close
          className="absolute top-4 right-4 rounded-sm text-ink-subtle hover:text-ink focus-visible:ring-2 focus-visible:ring-ring/50"
          aria-label={t("close")}
        >
          <X className="size-4" strokeWidth={1.5} />
        </RadixDialog.Close>
      </RadixDialog.Content>
    </RadixDialog.Portal>
  );
}

export function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof RadixDialog.Title>) {
  return <RadixDialog.Title className={cn("text-app-section text-ink", className)} {...props} />;
}

export function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof RadixDialog.Description>) {
  return (
    <RadixDialog.Description
      className={cn("text-app-body text-ink-subtle", className)}
      {...props}
    />
  );
}

export function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("mt-2 flex justify-end gap-2", className)} {...props} />;
}
