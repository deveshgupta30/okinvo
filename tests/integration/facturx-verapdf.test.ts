import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { toCii } from "@/lib/einvoice/cii/build";
import { toFacturX } from "@/lib/einvoice/facturx/assemble";
import { renderPdf } from "@/lib/documents/render";
import { sampleViewModel } from "@/lib/documents/sample";
import { DEFAULT_TEMPLATE_CONFIG } from "@/lib/schemas";
import { ukInput } from "../unit/einvoice-eu-input";

/**
 * The shipped Factur-X file is PDF/A-3b (spec §9e): a real rendered document assembled with the
 * EN 16931 XML passes veraPDF's 3b profile. Runs only where Docker is available (the dev
 * machine and CI); the image is verapdf/cli.
 */
function dockerAvailable(): boolean {
  try {
    execFileSync("docker", ["image", "inspect", "verapdf/cli:latest"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

describe.skipIf(!dockerAvailable())("Factur-X PDF/A-3b (veraPDF)", () => {
  it("validates a rendered invoice with the embedded CII as PDF/A-3b", async () => {
    const vm = sampleViewModel(DEFAULT_TEMPLATE_CONFIG);
    const pdf = await renderPdf(vm, DEFAULT_TEMPLATE_CONFIG, {
      assets: async () => null,
      createdAt: new Date("2026-05-01T00:00:00Z"),
    });
    const out = await toFacturX(pdf, toCii(ukInput()), {
      title: "Invoice INV-2026-0042",
      author: "Jo Bloggs Ltd",
      created: new Date("2026-05-01T00:00:00Z"),
      documentId: "0123456789abcdef0123456789abcdef",
    });
    const dir = mkdtempSync(join(tmpdir(), "okinvo-facturx-"));
    writeFileSync(join(dir, "invoice.pdf"), out);
    // Docker on Windows takes the host path as-is for the bind mount
    const report = execFileSync(
      "docker",
      [
        "run",
        "--rm",
        "-v",
        `${dir}:/data`,
        "verapdf/cli:latest",
        "-f",
        "3b",
        "--format",
        "text",
        "/data/invoice.pdf",
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
    expect(report).toContain("PASS");
    expect(report).not.toContain("FAIL");
  }, 180_000);
});
