import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import type { Column, ExportMeta } from "@/lib/exports/types";
import { xlsxBuffer } from "@/lib/exports/xlsx";

interface Row extends Record<string, string | null> {
  number: string | null;
  issueDate: string | null;
  qty: string | null;
  total: string | null;
  sentAt: string | null;
}

const columns: Column<Row>[] = [
  { key: "number", header: "Number", type: "string", width: 18 },
  { key: "issueDate", header: "Issue date", type: "date" },
  { key: "qty", header: "Qty", type: "number", numFmt: "#,##0.000" },
  { key: "total", header: "Total", type: "number" },
  { key: "sentAt", header: "Sent at", type: "datetime" },
];

const meta: ExportMeta = {
  dataset: "invoices",
  title: "Invoices register",
  generatedAt: "2026-10-01T12:34:56.000Z",
  appVersion: "0.0.0",
  filters: { fy: "2026-27", status: "PAID" },
};

async function load(rows: Row[]) {
  const buf = await xlsxBuffer(columns, rows, meta);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  return wb;
}

describe("xlsx writer", () => {
  it("writes typed cells under a bold, frozen, filtered header", async () => {
    const wb = await load([
      {
        number: "INV/26-27/001",
        issueDate: "2026-05-01",
        qty: "10.500",
        total: "1234.5",
        sentAt: "2026-05-02T10:00:00.000Z",
      },
    ]);
    const sheet = wb.getWorksheet("Invoices register");
    expect(sheet).toBeDefined();
    if (!sheet) return;
    expect(sheet.getRow(1).getCell(1).value).toBe("Number");
    expect(sheet.getRow(1).getCell(1).font?.bold).toBe(true);
    expect(sheet.views[0]).toMatchObject({ state: "frozen", ySplit: 1 });
    expect(sheet.autoFilter).toBe("A1:E1");
    expect(sheet.getColumn(1).width).toBe(18);

    const row = sheet.getRow(2);
    expect(row.getCell(1).type).toBe(ExcelJS.ValueType.String);
    expect(row.getCell(2).type).toBe(ExcelJS.ValueType.Date);
    expect((row.getCell(2).value as Date).toISOString()).toBe("2026-05-01T00:00:00.000Z");
    expect(row.getCell(3).type).toBe(ExcelJS.ValueType.Number);
    expect(row.getCell(3).value).toBe(10.5);
    expect(row.getCell(3).numFmt).toBe("#,##0.000");
    expect(row.getCell(4).value).toBe(1234.5);
    expect(row.getCell(4).numFmt).toBe("#,##0.00");
    expect(row.getCell(5).type).toBe(ExcelJS.ValueType.Date);
    expect((row.getCell(5).value as Date).toISOString()).toBe("2026-05-02T10:00:00.000Z");
  });

  it("writes formula-looking text as a plain string cell and null as empty", async () => {
    const wb = await load([
      { number: "=1+1", issueDate: null, qty: null, total: null, sentAt: null },
      { number: "\tcmd", issueDate: null, qty: null, total: null, sentAt: null },
    ]);
    const sheet = wb.getWorksheet("Invoices register");
    if (!sheet) throw new Error("sheet missing");
    const a2 = sheet.getRow(2).getCell(1);
    expect(a2.type).toBe(ExcelJS.ValueType.String);
    expect(a2.value).toBe("=1+1");
    expect(sheet.getRow(3).getCell(1).value).toBe("\tcmd");
    expect(sheet.getRow(2).getCell(2).type).toBe(ExcelJS.ValueType.Null);
  });

  it("records what was exported on a Filters sheet", async () => {
    const wb = await load([]);
    const filters = wb.getWorksheet("Filters");
    expect(filters).toBeDefined();
    if (!filters) return;
    const pairs: [unknown, unknown][] = [];
    filters.eachRow((r) => pairs.push([r.getCell(1).value, r.getCell(2).value]));
    expect(pairs).toEqual([
      ["Dataset", "invoices"],
      ["Generated at", "2026-10-01T12:34:56.000Z"],
      ["App version", "0.0.0"],
      ["fy", "2026-27"],
      ["status", "PAID"],
    ]);
  });
});
