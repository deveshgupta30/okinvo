import { documentResponse, withApi } from "@/lib/api/handlers";
import { isActor, requireApiActor } from "@/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/credit-notes/{id}/docx (documents:read). */
export const GET = withApi(async (request: Request, ctx: { params: Promise<{ id: string }> }) => {
  const actor = await requireApiActor("documents:read", request.headers);
  if (!isActor(actor)) return actor;
  const { id } = await ctx.params;
  return documentResponse(actor, "CREDIT_NOTE", id, "DOCX");
});
