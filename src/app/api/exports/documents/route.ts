import { findDisallowed } from "@/lib/input-charset";
import { Readable } from "node:stream";
import { after } from "next/server";
import { todayIn } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { exportFilename } from "@/lib/exports/filenames";
import { zipStream } from "@/lib/exports/zip";
import { PeriodExportFiltersSchema } from "@/lib/schemas/export-filters";
import { isActor, requireActorApi } from "@/server/auth";
import { audit } from "@/server/dal/audit";
import { documentsBundleEntries, documentsBundleRange } from "@/server/exports/documents-bundle";
import { enforceRateLimit } from "@/server/rate-limit";

export const runtime = "nodejs";

/**
 * `GET /api/exports/documents?fy=|from=&to=&issuerProfileId=` → `okinvo-documents-<from>_<to>.zip`
 * of issued and voided PDFs named by number plus `index.csv` (SPEC §4.11, Settings → Data).
 */
export async function GET(request: Request): Promise<Response> {
  const actor = await requireActorApi("OWNER");
  if (!isActor(actor)) return actor;
  const limited = await enforceRateLimit(request.headers, "exports", actor.userId);
  if (limited) return limited;

  const url = new URL(request.url);
  const raw: Record<string, string> = {};
  for (const [k, v] of url.searchParams) if (v) raw[k] = v;
  if (findDisallowed(raw).length) {
    return Response.json({ error: "bad_charset" }, { status: 400 });
  }
  const filters = PeriodExportFiltersSchema.safeParse(raw);
  if (!filters.success) {
    return Response.json({ error: "bad_filters", issues: filters.error.issues }, { status: 400 });
  }
  const range = await documentsBundleRange(filters.data);
  const filename = exportFilename("documents", "zip", range, todayIn(actor.timezone));

  after(() =>
    prisma.$transaction((tx) =>
      audit(tx, actor, "export.generated", "Export", "documents", {
        summary: "Documents as ZIP",
        after: { filename, filters: raw },
      }),
    ),
  );
  const body = zipStream(documentsBundleEntries(actor, filters.data));
  return new Response(Readable.toWeb(body) as ReadableStream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, max-age=0, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
