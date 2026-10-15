import { StatusSchema } from "@/lib/api/dto";
import { ok } from "@/lib/api/envelope";
import { withApi } from "@/lib/api/handlers";
import { isActor, requireApiActor } from "@/server/auth";
import { collectStatus } from "@/server/status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/status (scope status:read); 503 when the instance reports failed. */
export const GET = withApi(async (request: Request) => {
  const actor = await requireApiActor("status:read", request.headers);
  if (!isActor(actor)) return actor;
  const report = await collectStatus();
  return ok(StatusSchema.parse(report), { status: report.overall === "failed" ? 503 : 200 });
});
