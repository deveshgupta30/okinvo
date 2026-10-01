import * as React from "react";
import { cn } from "@/lib/utils";

export function DescriptionList({ className, ...props }: React.ComponentProps<"dl">) {
  return (
    <dl
      className={cn("grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-app-body", className)}
      {...props}
    />
  );
}

export function Item({
  label,
  children,
  mono,
  className,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
  mono?: boolean;
  className?: string;
}) {
  return (
    <>
      <dt className="text-app-label text-ink-subtle">{label}</dt>
      <dd className={cn("min-w-0 text-ink", mono && "text-app-mono", className)}>
        {children ?? <span className="text-ink-tertiary">—</span>}
      </dd>
    </>
  );
}
