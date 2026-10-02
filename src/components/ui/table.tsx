import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Data table. With `cards`, rows become stacked cards below `md` and every cell shows its column
 * name from `TD`'s `label` (CSS in globals.css, `.table-cards`); without it the table scrolls
 * horizontally, which suits wide ledgers better than wrapping.
 */
export function Table({
  className,
  cards,
  ...props
}: React.ComponentProps<"table"> & { cards?: boolean }) {
  return (
    <div
      className={cn(
        "w-full overflow-x-auto rounded-lg border border-hairline",
        cards && "max-md:overflow-visible max-md:rounded-none max-md:border-0",
      )}
    >
      <table
        className={cn("w-full border-collapse text-app-table", cards && "table-cards", className)}
        {...props}
      />
    </div>
  );
}

export function THead({ className, ...props }: React.ComponentProps<"thead">) {
  return <thead className={cn("bg-surface-2", className)} {...props} />;
}

export function TBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return <tbody className={cn("divide-y divide-hairline", className)} {...props} />;
}

export function TR({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      className={cn("h-10 transition-colors duration-150 hover:bg-surface-2", className)}
      {...props}
    />
  );
}

export function TH({
  className,
  numeric,
  ...props
}: React.ComponentProps<"th"> & { numeric?: boolean }) {
  return (
    <th
      scope="col"
      className={cn(
        "h-10 px-3 text-left text-app-label font-medium whitespace-nowrap text-ink-subtle",
        numeric && "text-right",
        className,
      )}
      {...props}
    />
  );
}

export function TD({
  className,
  numeric,
  mono,
  label,
  ...props
}: React.ComponentProps<"td"> & { numeric?: boolean; mono?: boolean; label?: string }) {
  return (
    <td
      {...(label !== undefined ? { "data-label": label } : {})}
      className={cn(
        "px-3 py-2 align-middle text-ink",
        numeric && "text-right text-app-amount tabular-nums",
        mono && "text-app-mono",
        className,
      )}
      {...props}
    />
  );
}

export function TableEmpty({ colSpan, children }: { colSpan: number; children: React.ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-3 py-10 text-center text-app-body text-ink-subtle">
        {children}
      </td>
    </tr>
  );
}
