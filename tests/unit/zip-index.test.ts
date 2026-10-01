import { Readable } from "node:stream";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import {
  documentFileName,
  documentsIndexCsv,
  zipBuffer,
  type DocumentIndexRow,
} from "@/lib/exports/zip";

describe("documents bundle", () => {
  it("names PDFs by document number under a folder per kind", () => {
    expect(documentFileName("INVOICE", "INV/26-27/001", 1)).toBe("invoices/INV-26-27-001.pdf");
    expect(documentFileName("CREDIT_NOTE", "CN/26-27/007", 2)).toBe(
      "credit-notes/CN-26-27-007-v2.pdf",
    );
    expect(documentFileName("INVOICE", "../etc/passwd", 1)).toBe("invoices/etc-passwd.pdf");
  });

  it("adds an issuer folder when asked, since numbers are only unique per issuer", () => {
    expect(documentFileName("INVOICE", "INV/26-27/001", 1, "Sample studio")).toBe(
      "invoices/Sample-studio/INV-26-27-001.pdf",
    );
    expect(documentFileName("CREDIT_NOTE", "CN/26-27/001", 3, "Ács & Co.")).toBe(
      "credit-notes/cs-Co/CN-26-27-001-v3.pdf",
    );
  });

  it("writes index.csv with one guarded row per document", async () => {
    const rows: DocumentIndexRow[] = [
      {
        kind: "INVOICE",
        number: "INV/26-27/001",
        status: "ISSUED",
        issueDate: "2026-05-01",
        issuer: "Sample studio",
        client: "=Acme",
        currency: "INR",
        total: "11800.00",
        file: "invoices/INV-26-27-001.pdf",
        version: "1",
        sha256: "abc",
      },
    ];
    const csv = await documentsIndexCsv(rows);
    expect(csv.slice(1).split("\r\n")).toEqual([
      "Kind,Number,Status,Issue date,Issuer,Client,Currency,Total,File,Version,SHA-256",
      "INVOICE,INV/26-27/001,ISSUED,2026-05-01,Sample studio,'=Acme,INR,11800.00,invoices/INV-26-27-001.pdf,1,abc",
      "",
    ]);
  });
});

describe("zipBuffer", () => {
  it("bundles string, buffer, stream and lazily produced entries in order", async () => {
    const calls: string[] = [];
    async function* entries() {
      yield { name: "README.txt", body: "hello" };
      yield {
        name: "csv/a.csv",
        body: () => {
          calls.push("a");
          return Promise.resolve(Buffer.from("x,y\r\n"));
        },
      };
      yield {
        name: "pdf/b.pdf",
        body: () => {
          calls.push("b");
          return Readable.from([Buffer.from("%PDF-"), Buffer.from("1.7")]);
        },
      };
    }
    const buf = await zipBuffer(entries());
    const zip = await JSZip.loadAsync(buf);
    expect(Object.keys(zip.files).sort()).toEqual(["README.txt", "csv/a.csv", "pdf/b.pdf"]);
    expect(await zip.file("README.txt")?.async("string")).toBe("hello");
    expect(await zip.file("csv/a.csv")?.async("string")).toBe("x,y\r\n");
    expect(await zip.file("pdf/b.pdf")?.async("string")).toBe("%PDF-1.7");
    expect(calls).toEqual(["a", "b"]);
  });
});
