import { stringify } from "csv-stringify/sync";
import { guardCell } from "./guard";
import type { Column, ExportRow } from "./types";

/**
 * CSV writer (SPEC §4.11): UTF-8 BOM so Excel detects the encoding, `\r\n` records, RFC 4180
 * quoting (only when a field holds a delimiter, quote or line break), ISO dates, plain decimal
 * numbers, and every text cell through the formula-injection guard. Streams one record per chunk so
 * the route never holds a whole dataset in memory.
 */
const BOM = "﻿";
// csv-stringify quotes on the delimiter, the quote and the full record delimiter; a lone CR or LF
// inside a field is a line break to most readers, so quote those too.
const OPTIONS = { record_delimiter: "\r\n", quoted_match: /[\r\n]/ } as const;

function cell<Row extends ExportRow>(col: Column<Row>, row: Row): string {
  const v = row[col.key];
  if (v === null || v === undefined) return "";
  return col.type === "string" ? guardCell(v) : v;
}

export async function* csvChunks<Row extends ExportRow>(
  columns: Column<Row>[],
  rows: AsyncIterable<Row> | Iterable<Row>,
): AsyncGenerator<string> {
  yield BOM + stringify([columns.map((c) => c.header)], OPTIONS);
  for await (const row of rows) {
    yield stringify([columns.map((c) => cell(c, row))], OPTIONS);
  }
}

/** Whole file as a string (tests and the ZIP bundles). */
export async function csvString<Row extends ExportRow>(
  columns: Column<Row>[],
  rows: AsyncIterable<Row> | Iterable<Row>,
): Promise<string> {
  let out = "";
  for await (const chunk of csvChunks(columns, rows)) out += chunk;
  return out;
}
