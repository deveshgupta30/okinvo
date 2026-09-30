import { checkReadiness } from "@/lib/health";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const result = await checkReadiness(() => prisma.$queryRaw`SELECT 1`, 1000);
  return Response.json(result.body, {
    status: result.status,
    headers: { "Cache-Control": "no-store" },
  });
}
