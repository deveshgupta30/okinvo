import { Readable } from "node:stream";
import { after } from "next/server";
import { todayIn } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { zipStream } from "@/lib/exports/zip";
import { isActor, requireActorApi } from "@/server/auth";
import { audit } from "@/server/dal/audit";
import { allDataEntries } from "@/server/exports/all-data";
import { enforceRateLimit } from "@/server/rate-limit";

export const runtime = "nodejs";

/** `GET /api/exports/all-data` → `okinvo-data-<date>.zip` (SPEC §4.11, Settings → Data). */
export async function GET(request: Request): Promise<Response> {
  const actor = await requireActorApi("OWNER");
  if (!isActor(actor)) return actor;
  const limited = await enforceRateLimit(request.headers, "exports", actor.userId);
  if (limited) return limited;

  const filename = `okinvo-data-${todayIn(actor.timezone)}.zip`;
  after(() =>
    prisma.$transaction((tx) =>
      audit(tx, actor, "export.generated", "Export", "all-data", {
        summary: "All data as ZIP (CSV + data.json)",
        after: { filename },
      }),
    ),
  );
  return new Response(Readable.toWeb(zipStream(allDataEntries(actor))) as ReadableStream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, max-age=0, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
