import { describe, expect, it } from "vitest";
import { csvString } from "@/lib/exports/csv";
import { exportFilename } from "@/lib/exports/filenames";
import type { Column } from "@/lib/exports/types";

interface Row extends Record<string, string | null> {
  number: string | null;
  client: string | null;
  issueDate: string | null;
  total: string | null;
  sentAt: string | null;
}

const columns: Column<Row>[] = [
  { key: "number", header: "Number", type: "string" },
  { key: "client", header: "Client", type: "string" },
  { key: "issueDate", header: "Issue date", type: "date" },
  { key: "total", header: "Total", type: "number" },
  { key: "sentAt", header: "Sent at", type: "datetime" },
];

describe("csv writer", () => {
  it("writes a BOM, a header row, CRLF line endings and plain numbers", async () => {
    const out = await csvString(columns, [
      {
        number: "INV/26-27/001",
        client: "Acme",
        issueDate: "2026-05-01",
        total: "1234.50",
        sentAt: "2026-05-02T10:00:00.000Z",
      },
    ]);
    expect(out.startsWith("﻿")).toBe(true);
    expect(out.slice(1)).toBe(
      "Number,Client,Issue date,Total,Sent at\r\n" +
        "INV/26-27/001,Acme,2026-05-01,1234.50,2026-05-02T10:00:00.000Z\r\n",
    );
  });

  it("quotes per RFC 4180 and writes null as an empty field", async () => {
    const out = await csvString(columns, [
      {
        number: null,
        client: 'Acme "Pvt", Ltd\nSecond line',
        issueDate: null,
        total: null,
        sentAt: null,
      },
    ]);
    const lines = out.slice(1).split("\r\n");
    expect(lines[1]).toBe(',"Acme ""Pvt"", Ltd\nSecond line",,,');
  });

  it("guards formula triggers in text cells only", async () => {
    const out = await csvString(columns, [
      { number: "=1+1", client: "\tcmd", issueDate: null, total: "-5.00", sentAt: null },
      { number: "\rx", client: "\u0000=HYPERLINK()", issueDate: null, total: "0.00", sentAt: null },
      { number: "@SUM(A1)", client: "+1", issueDate: null, total: "1.00", sentAt: null },
    ]);
    const lines = out.slice(1).split("\r\n");
    expect(lines[1]).toBe("'=1+1,'\tcmd,,-5.00,");
    expect(lines[2]).toBe("\"'\rx\",'=HYPERLINK(),,0.00,");
    expect(lines[3]).toBe("'@SUM(A1),'+1,,1.00,");
  });

  it("accepts an async iterable of rows", async () => {
    async function* rows(): AsyncGenerator<Row> {
      yield { number: "a", client: null, issueDate: null, total: null, sentAt: null };
      yield { number: "b", client: null, issueDate: null, total: null, sentAt: null };
    }
    const out = await csvString(columns, rows());
    expect(out.slice(1).split("\r\n")).toEqual([
      "Number,Client,Issue date,Total,Sent at",
      "a,,,,",
      "b,,,,",
      "",
    ]);
  });
});

describe("exportFilename", () => {
  it("names the file after the dataset and the exported range", () => {
    expect(
      exportFilename("invoices", "csv", { from: "2026-04-01", to: "2027-03-31" }, "2026-10-01"),
    ).toBe("okinvo-invoices-2026-04-01_2027-03-31.csv");
    expect(exportFilename("gst-summary", "xlsx", { from: "2026-04-01" }, "2026-10-01")).toBe(
      "okinvo-gst-summary-2026-04-01_2026-10-01.xlsx",
    );
    expect(exportFilename("clients", "csv", null, "2026-10-01")).toBe(
      "okinvo-clients-2026-10-01.csv",
    );
  });
});
