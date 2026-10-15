import { isActor, requireActorApi } from "@/server/auth";
import { collectStatus } from "@/server/status";

export const dynamic = "force-dynamic";

/** The full status report for signed-in users and API clients (spec §6.5); never cached. */
export async function GET(): Promise<Response> {
  const actor = await requireActorApi("VIEWER");
  if (!isActor(actor)) return actor;
  const report = await collectStatus();
  return Response.json(report, {
    status: report.overall === "failed" ? 503 : 200,
    headers: { "Cache-Control": "no-store" },
  });
}
