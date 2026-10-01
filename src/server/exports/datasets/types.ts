import type { z } from "zod";
import type { Column, ColumnBase, DatasetId, ExportRow } from "@/lib/exports/types";
import type { Actor } from "@/server/actor";
import type { DateRange } from "@/server/dal/fiscal-range";

export interface RowsOptions {
  /** Rows per Prisma query; the default is `EXPORT_PAGE_SIZE`. Tests pass a small number. */
  pageSize?: number | undefined;
}

/**
 * One export dataset (v2 §13.1). `filters` parses the query string, `range` resolves the date span
 * for the file name and the XLSX `Filters` sheet (null when the dataset has no date dimension), and
 * `rows` streams cursor-paginated rows with every cell already stringified.
 */
export interface Dataset<F, Row extends ExportRow> {
  id: DatasetId;
  title: string;
  filters: z.ZodType<F>;
  columns: Column<Row>[];
  range(filters: F): Promise<DateRange | null>;
  rows(actor: Actor, filters: F, opts?: RowsOptions): AsyncIterable<Row>;
}

/**
 * The registry's element type. It is spelled out (not `Dataset<unknown, ExportRow>`) because
 * `keyof Row` makes `Column<Row>` contravariant; `ColumnBase` drops that constraint, and the
 * method-style members keep the filter generic assignable.
 */
export interface AnyDataset {
  id: DatasetId;
  title: string;
  filters: z.ZodType<unknown>;
  columns: ColumnBase[];
  range(filters: unknown): Promise<DateRange | null>;
  rows(actor: Actor, filters: unknown, opts?: RowsOptions): AsyncIterable<ExportRow>;
}

export function defineDataset<F, Row extends ExportRow>(d: Dataset<F, Row>): Dataset<F, Row> {
  return d;
}
