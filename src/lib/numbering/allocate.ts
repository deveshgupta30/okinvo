import type { Tx } from "@/lib/db";

export type SequenceKind = "INVOICE" | "CREDIT_NOTE";

/**
 * The only place a document number is assigned (CLAUDE.md "Numbering"). One upsert takes the row
 * lock implicitly, so concurrent issues serialise and a rolled-back transaction rolls the counter
 * back with it - no gaps, no duplicates (v2 §8.4). Must run inside the issue transaction.
 */
export async function allocateDocumentNumber(
  tx: Tx,
  p: { issuerProfileId: string; kind: SequenceKind; fiscalYear: string },
): Promise<number> {
  const rows = await tx.$queryRaw<{ seq: number }[]>`
    INSERT INTO "DocumentSequence" ("id", "issuerProfileId", "kind", "fiscalYear", "nextNumber")
    VALUES (uuidv7()::text, ${p.issuerProfileId}, ${p.kind}::"DocumentKind", ${p.fiscalYear}, 2)
    ON CONFLICT ("issuerProfileId", "kind", "fiscalYear")
    DO UPDATE SET "nextNumber" = "DocumentSequence"."nextNumber" + 1
    RETURNING "nextNumber" - 1 AS seq`;
  const seq = rows[0]?.seq;
  if (typeof seq !== "number") throw new Error("document number allocation returned no row");
  return seq;
}
