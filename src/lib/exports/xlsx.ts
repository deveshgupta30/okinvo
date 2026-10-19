import { PassThrough, type Readable } from "node:stream";
import ExcelJS from "exceljs";
import type { CellType, Column, ColumnBase, ExportMeta, ExportRow } from "./types";

/**
 * XLSX writer (SPEC §4.11, v2 §13.2): exceljs' streaming `WorkbookWriter` into a PassThrough so the
 * route can pipe it. Header row bold and frozen, autofilter over the header, column widths, numbers
 * as numeric cells with `#,##0.00` (or the column's own format), dates as real dates, and a second
 * sheet `Filters` recording dataset, generation time, app version and the applied filters.
 *
 * Text is written as an explicit string value, never a formula: exceljs only emits `<f>` for
 * `{ formula }` objects, so `=1+1` stays the text `=1+1`. No apostrophe prefix is added - that is
 * the CSV rule; here the cell type itself carries the guarantee.
 */
const DEFAULT_WIDTH: Record<CellType, number> = {
  string: 24,
  number: 14,
  date: 12,
  datetime: 22,
};
const DATE_FMT = "yyyy-mm-dd";
const DATETIME_FMT = "yyyy-mm-dd hh:mm:ss";
const MONEY_FMT = "#,##0.00";

function cellValue<Row extends ExportRow>(col: Column<Row>, row: Row): ExcelJS.CellValue {
  const v = row[col.key];
  if (v === null || v === undefined || v === "") return null;
  switch (col.type) {
    case "number": {
      const n = Number(v);
      return Number.isFinite(n) ? n : v;
    }
    case "date":
      return new Date(`${v}T00:00:00.000Z`);
    case "datetime":
      return new Date(v);
    default:
      return v;
  }
}

function numFmt(col: ColumnBase): string | null {
  switch (col.type) {
    case "number":
      return col.numFmt ?? MONEY_FMT;
    case "date":
      return DATE_FMT;
    case "datetime":
      return DATETIME_FMT;
    default:
      return null;
  }
}

async function write<Row extends ExportRow>(
  stream: PassThrough,
  columns: Column<Row>[],
  rows: AsyncIterable<Row> | Iterable<Row>,
  meta: ExportMeta,
): Promise<void> {
  const wb = new ExcelJS.stream.xlsx.WorkbookWriter({
    stream,
    useStyles: true,
    useSharedStrings: false,
  });
  wb.creator = "okinvo";
  wb.created = new Date(meta.generatedAt);

  const sheet = wb.addWorksheet(meta.title.slice(0, 31), {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  // The streaming writer reads `autoFilter` at commit; the option is not in its typings.
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  sheet.columns = columns.map((c) => ({ key: c.key, width: c.width ?? DEFAULT_WIDTH[c.type] }));
  const header = sheet.addRow(columns.map((c) => c.header));
  header.font = { bold: true };
  header.commit();

  const formats = columns.map(numFmt);
  for await (const row of rows) {
    const r = sheet.addRow(columns.map((c) => cellValue(c, row)));
    formats.forEach((fmt, i) => {
      if (fmt) r.getCell(i + 1).numFmt = fmt;
    });
    r.commit();
  }
  sheet.commit();

  const filters = wb.addWorksheet("Filters");
  filters.columns = [{ width: 18 }, { width: 40 }];
  filters.addRow(["Dataset", meta.dataset]).commit();
  filters.addRow(["Generated at", meta.generatedAt]).commit();
  filters.addRow(["App version", meta.appVersion]).commit();
  for (const [k, v] of Object.entries(meta.filters)) filters.addRow([k, v]).commit();
  filters.commit();

  await wb.commit();
}

/** A readable XLSX byte stream; the workbook is written in the background and errors destroy it. */
export function xlsxStream<Row extends ExportRow>(
  columns: Column<Row>[],
  rows: AsyncIterable<Row> | Iterable<Row>,
  meta: ExportMeta,
): Readable {
  const stream = new PassThrough();
  write(stream, columns, rows, meta).catch((e: unknown) => {
    stream.destroy(e instanceof Error ? e : new Error(String(e)));
  });
  return stream;
}

/** Whole workbook as a Buffer (tests and the ZIP bundles). */
export async function xlsxBuffer<Row extends ExportRow>(
  columns: Column<Row>[],
  rows: AsyncIterable<Row> | Iterable<Row>,
  meta: ExportMeta,
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of xlsxStream(columns, rows, meta)) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}
