import { Readable } from "node:stream";
import { after } from "next/server";
import { todayIn } from "@/lib/dates";
import { prisma } from "@/lib/db";
import {
  CONTENT_TYPES,
  csvChunks,
  exportFilename,
  xlsxStream,
  type ExportMeta,
} from "@/lib/exports";
import { ExportFormatSchema } from "@/lib/schemas/export-filters";
import { APP_VERSION } from "@/lib/version";
import { isActor, requireActorApi } from "@/server/auth";
import { audit } from "@/server/dal/audit";
import { DATASET_MIN_ROLE } from "@/lib/exports/roles";
import { hasRole } from "@/server/dal/authz";
import { getDataset } from "@/server/exports/datasets";
import { enforceRateLimit } from "@/server/rate-limit";

export const runtime = "nodejs";

/** Keys the index pages add to their query strings that are not dataset filters. */
const NOT_FILTERS = new Set(["format", "page", "flash"]);

async function* utf8(chunks: AsyncIterable<string>): AsyncGenerator<Buffer> {
  for await (const c of chunks) yield Buffer.from(c, "utf8");
}

/**
 * `GET /api/exports/[dataset]?format=csv|xlsx&…filters` (SPEC §4.11, v2 §13.4): owner-only,
 * rate-limited, streamed, named `okinvo-<dataset>-<from>_<to>.<ext>`, audited after the response.
 */
export async function GET(
  request: Request,
  ctx: { params: Promise<{ dataset: string }> },
): Promise<Response> {
  const actor = await requireActorApi("VIEWER");
  if (!isActor(actor)) return actor;
  const limited = await enforceRateLimit(request.headers, "exports", actor.userId);
  if (limited) return limited;

  const { dataset } = await ctx.params;
  const ds = getDataset(dataset);
  if (ds && !hasRole(actor, DATASET_MIN_ROLE[ds.id])) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  if (!ds) return Response.json({ error: "not_found" }, { status: 404 });

  const url = new URL(request.url);
  const format = ExportFormatSchema.safeParse(url.searchParams.get("format") ?? undefined);
  if (!format.success) return Response.json({ error: "bad_format" }, { status: 400 });
  const raw: Record<string, string> = {};
  for (const [k, v] of url.searchParams) if (!NOT_FILTERS.has(k) && v) raw[k] = v;
  const filters = ds.filters.safeParse(raw);
  if (!filters.success) {
    return Response.json({ error: "bad_filters", issues: filters.error.issues }, { status: 400 });
  }

  const today = todayIn(actor.timezone);
  const range = await ds.range(filters.data);
  const filename = exportFilename(ds.id, format.data, range, today);
  const applied: Record<string, string> = { ...raw };
  if (range?.from) applied.rangeFrom = range.from;
  if (range?.to) applied.rangeTo = range.to;
  const meta: ExportMeta = {
    dataset: ds.id,
    title: ds.title,
    generatedAt: new Date().toISOString(),
    appVersion: APP_VERSION,
    filters: applied,
  };

  const rows = ds.rows(actor, filters.data);
  const body =
    format.data === "csv"
      ? Readable.from(utf8(csvChunks(ds.columns, rows)), { objectMode: false })
      : xlsxStream(ds.columns, rows, meta);

  after(() =>
    prisma.$transaction((tx) =>
      audit(tx, actor, "export.generated", "Export", ds.id, {
        summary: `${ds.title} as ${format.data.toUpperCase()}`,
        after: { filename, filters: applied },
      }),
    ),
  );

  return new Response(Readable.toWeb(body) as ReadableStream, {
    headers: {
      "Content-Type": CONTENT_TYPES[format.data],
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, max-age=0, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
