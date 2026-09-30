import { checkReadiness } from "@/lib/health";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Well under compose's 3 s healthcheck timeout, but tolerant of a cold client on the first probe. */
const READINESS_BUDGET_MS = 2_000;

export async function GET(): Promise<Response> {
  const result = await checkReadiness(
    () => prisma.$queryRaw`SELECT 1`,
    READINESS_BUDGET_MS,
    (cause, error) => console.error(`readiness probe failed (${cause})`, error ?? ""),
  );
  return Response.json(result.body, {
    status: result.status,
    headers: { "Cache-Control": "no-store" },
  });
}
