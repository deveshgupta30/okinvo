import type { LucideIcon } from "lucide-react";
import * as React from "react";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-hairline px-6 py-16 text-center">
      <Icon aria-hidden className="size-8 text-ink-subtle" strokeWidth={1.5} />
      <p className="text-app-section text-ink">{title}</p>
      {description ? <p className="max-w-md text-app-body text-ink-subtle">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
