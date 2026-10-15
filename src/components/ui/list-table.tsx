"use client";

import * as React from "react";
import { Table as BeuiTable, type TableColumn } from "@/components/motion/table";
import { TBody, TD, TH, THead, TR, Table, TableEmpty } from "@/components/ui/table";
import { useIsMobile } from "@/lib/is-mobile";
import { cn } from "@/lib/utils";

export interface ListColumn {
  key: string;
  /** Column heading; also the card label below `md`. Empty for an actions column. */
  header: string;
  numeric?: boolean;
  /** Default true; false for action columns. */
  sortable?: boolean;
  /** A CSS width for the desktop table ("12rem"); the rest share what is left. */
  width?: string;
}

export interface ListCell {
  node: React.ReactNode;
  /** What the column sorts by; the desktop table sorts client-side within the page. */
  sort?: string | number;
  mono?: boolean;
  numeric?: boolean;
  className?: string;
}

export interface ListRow {
  id: string;
  cells: Record<string, ListCell>;
}

const ROW_HEIGHT = 40;

const noop = () => () => {};
/** False during server rendering and hydration, true afterwards. */
function useHydrated(): boolean {
  return React.useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
}

/**
 * Every list table (addendum §3): beui's virtualised, sortable table from `md` up and the
 * stacked-card table below it (v2 §24, mobile). Pages build serialisable rows of nodes once;
 * both layouts render the same cells, so links, pills and row actions behave the same.
 */
export function ListTable({
  columns,
  rows,
  empty,
  className,
}: {
  columns: ListColumn[];
  rows: ListRow[];
  /** Shown instead of rows when there are none. */
  empty: React.ReactNode;
  className?: string;
}) {
  const beuiColumns = React.useMemo<TableColumn<ListRow>[]>(
    () =>
      columns.map((c) => ({
        key: c.key,
        header: c.header,
        sortable: c.sortable ?? c.header !== "",
        align: c.numeric ? "right" : "left",
        ...(c.width ? { width: c.width } : {}),
        cell: (row) => {
          const cell = row.cells[c.key];
          return (
            <span
              className={cn(
                "block min-w-0 truncate",
                (cell?.numeric ?? c.numeric) && "text-right text-app-amount tabular-nums",
                cell?.mono && "text-app-mono",
                cell?.className,
              )}
            >
              {cell?.node}
            </span>
          );
        },
        sortValue: (row) => {
          const cell = row.cells[c.key];
          if (cell?.sort !== undefined) return cell.sort;
          return typeof cell?.node === "string" || typeof cell?.node === "number" ? cell.node : "";
        },
      })),
    [columns],
  );
  // Tall enough for every row of the page: lists are paginated by the server, so the page scrolls
  // rather than a box inside it, and every row stays in the DOM for find-in-page and tests.
  const height = rows.length === 0 ? ROW_HEIGHT * 4 : ROW_HEIGHT * (rows.length + 1) + 2;

  // One layout at a time (not both behind CSS), so text lookups and screen readers meet each row
  // once. The virtualised table has no rows until it can measure itself in the browser, so the
  // server (and the first paint) sends the plain table with every row; beui takes over once
  // hydrated, at the same density.
  const isMobile = useIsMobile();
  const hydrated = useHydrated();
  if (isMobile || !hydrated) {
    return (
      <div className={className}>
        <Table {...(isMobile ? { cards: true } : {})}>
          <THead>
            <TR>
              {columns.map((c) => (
                <TH key={c.key} {...(c.numeric ? { numeric: true } : {})}>
                  {c.header}
                </TH>
              ))}
            </TR>
          </THead>
          <TBody>
            {rows.length === 0 ? (
              <TableEmpty colSpan={columns.length}>{empty}</TableEmpty>
            ) : (
              rows.map((row) => (
                <TR key={row.id}>
                  {columns.map((c) => {
                    const cell = row.cells[c.key];
                    return (
                      <TD
                        key={c.key}
                        label={c.header}
                        {...((cell?.numeric ?? c.numeric) ? { numeric: true } : {})}
                        {...(cell?.mono ? { mono: true } : {})}
                        {...(cell?.className ? { className: cell.className } : {})}
                      >
                        {cell?.node}
                      </TD>
                    );
                  })}
                </TR>
              ))
            )}
          </TBody>
        </Table>
      </div>
    );
  }
  return (
    <div className={className} data-list-table>
      <BeuiTable<ListRow>
        data={rows}
        columns={beuiColumns}
        getRowId={(row) => row.id}
        rowHeight={ROW_HEIGHT}
        height={height}
        emptyState={<span className="text-app-body text-ink-subtle">{empty}</span>}
        className="rounded-sm border-hairline bg-transparent text-app-table"
      />
    </div>
  );
}
