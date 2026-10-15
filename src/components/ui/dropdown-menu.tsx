"use client";

import * as React from "react";
import { DropdownMenu as Radix } from "radix-ui";
import { cn } from "@/lib/utils";

export const DropdownMenu = Radix.Root;
export const DropdownMenuTrigger = Radix.Trigger;
export const DropdownMenuGroup = Radix.Group;

export function DropdownMenuContent({
  className,
  sideOffset = 6,
  ...props
}: React.ComponentProps<typeof Radix.Content>) {
  return (
    <Radix.Portal>
      <Radix.Content
        sideOffset={sideOffset}
        className={cn(
          "z-50 min-w-48 rounded-md border border-hairline-strong bg-surface-3 p-1 text-ink shadow-none outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
          className,
        )}
        {...props}
      />
    </Radix.Portal>
  );
}

export function DropdownMenuItem({ className, ...props }: React.ComponentProps<typeof Radix.Item>) {
  return (
    <Radix.Item
      className={cn(
        "flex h-8 cursor-default items-center gap-2 rounded-sm px-2 text-app-body text-ink outline-none select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-surface-2 [&_svg]:size-4 [&_svg]:shrink-0",
        className,
      )}
      {...props}
    />
  );
}

export function DropdownMenuLabel({
  className,
  ...props
}: React.ComponentProps<typeof Radix.Label>) {
  return (
    <Radix.Label
      className={cn("px-2 py-1.5 text-app-caption text-ink-subtle", className)}
      {...props}
    />
  );
}

export function DropdownMenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof Radix.Separator>) {
  return <Radix.Separator className={cn("my-1 h-px bg-hairline", className)} {...props} />;
}
