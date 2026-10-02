/**
 * Export datasets and writers (SPEC.md §4.11, v2 §13). Pure types shared by the CSV/XLSX writers
 * (`src/lib/exports`) and the server-side datasets (`src/server/exports`).
 *
 * Every cell travels as a string or null so the writers never see a `number` for an amount:
 * - `number` cells are canonical decimal strings (`"1234.50"`, `"10.500"`, `"0.82345678"`) produced
 *   by `toMoneyString` / `Decimal.toString()`; CSV writes them verbatim, XLSX converts to a typed
 *   numeric cell.
 * - `date` cells are `YYYY-MM-DD` strings; `datetime` cells are ISO instants.
 * - `string` cells pass through the formula-injection guard.
 */
export type CellType = "string" | "number" | "date" | "datetime";

export type ExportRow = Record<string, string | null>;

/** A column as the writers and the dataset registry see it: any string key. */
export interface ColumnBase {
  key: string;
  header: string;
  type: CellType;
  /** XLSX column width in characters; the writer picks a default from the type when absent. */
  width?: number | undefined;
  /** XLSX number format for `number` cells; `#,##0.00` when absent. */
  numFmt?: string | undefined;
}

/** A column of a specific row shape: the key must be one of the row's fields. */
export interface Column<Row extends ExportRow = ExportRow> extends ColumnBase {
  key: keyof Row & string;
}

export const DATASET_IDS = [
  "invoices",
  "invoice-items",
  "payments",
  "credit-notes",
  "clients",
  "services",
  "products",
  "gst-summary",
  "tds-summary",
] as const;
export type DatasetId = (typeof DATASET_IDS)[number];

export type ExportFormat = "csv" | "xlsx";

/** What the XLSX `Filters` sheet records about an export. */
export interface ExportMeta {
  dataset: string;
  title: string;
  /** ISO instant. */
  generatedAt: string;
  appVersion: string;
  /** The filter values that were applied, already stringified; empty when none. */
  filters: Record<string, string>;
}

export const CONTENT_TYPES: Record<ExportFormat, string> = {
  csv: "text/csv; charset=utf-8",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};
