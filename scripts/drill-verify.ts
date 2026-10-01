/**
 * Restore-drill verification (scripts/restore-drill.sh): after backup → wipe → restore, the row
 * counts recorded by drill-fixture.ts must match and the restored PDF must hash to the value the
 * Document row carries. Exits 1 on any difference.
 */
import "dotenv/config";
import { createHash } from "node:crypto";

process.env.FIELD_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString("base64");
process.env.APP_URL ??= "http://127.0.0.1:3000";
process.env.AUTH_SECRET ??= "drill-only-secret-value-that-is-long-enough-0123456789";

interface Fixture {
  invoiceId: string;
  number: string;
  documentId: string;
  storageKey: string;
  sha256: string;
  counts: Record<string, number>;
}

async function main() {
  const raw = process.argv[2];
  if (!raw) throw new Error("usage: drill-verify.ts '<fixture json>'");
  const fixture = JSON.parse(raw) as Fixture;
  const { prisma } = await import("../src/lib/db");
  const { storage } = await import("../src/lib/storage");

  const counts = {
    issuerProfiles: await prisma.issuerProfile.count({ where: { archivedAt: {} } }),
    clients: await prisma.client.count({ where: { archivedAt: {} } }),
    serviceItems: await prisma.serviceItem.count({ where: { archivedAt: {} } }),
    invoices: await prisma.invoice.count(),
    invoiceItems: await prisma.invoiceItem.count(),
    documents: await prisma.document.count(),
    auditEvents: await prisma.auditEvent.count(),
  };
  const problems: string[] = [];
  for (const [table, expected] of Object.entries(fixture.counts)) {
    const actual = counts[table as keyof typeof counts];
    if (actual !== expected) problems.push(`${table}: expected ${expected}, found ${actual}`);
  }

  const invoice = await prisma.invoice.findUnique({ where: { id: fixture.invoiceId } });
  if (!invoice) problems.push(`invoice ${fixture.invoiceId} missing`);
  else if (invoice.number !== fixture.number) {
    problems.push(`invoice number: expected ${fixture.number}, found ${invoice.number}`);
  }

  const doc = await prisma.document.findUnique({ where: { id: fixture.documentId } });
  if (!doc) problems.push(`document ${fixture.documentId} missing`);
  else {
    if (doc.sha256 !== fixture.sha256) problems.push("document row hash differs");
    try {
      const obj = await storage.get(doc.storageKey);
      const hash = createHash("sha256");
      for await (const chunk of obj.stream) hash.update(chunk as Buffer);
      const digest = hash.digest("hex");
      if (digest !== fixture.sha256) {
        problems.push(`restored PDF hash ${digest} ≠ expected ${fixture.sha256}`);
      }
    } catch (e) {
      problems.push(`restored PDF unreadable: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  await prisma.$disconnect();
  if (problems.length > 0) {
    console.error(`restore drill FAILED:\n  ${problems.join("\n  ")}`);
    process.exit(1);
  }
  console.log(
    `restore drill OK: ${Object.entries(counts)
      .map(([k, v]) => `${k}=${v}`)
      .join(" ")} and PDF ${fixture.number} hashes to ${fixture.sha256.slice(0, 12)}…`,
  );
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
