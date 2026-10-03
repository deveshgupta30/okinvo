import { CreditNoteSchema } from "@/lib/api/dto";
import { ok } from "@/lib/api/envelope";
import { withApi } from "@/lib/api/handlers";
import { isActor, requireApiActor } from "@/server/auth";
import { getCreditNote } from "@/server/dal/credit-notes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/credit-notes/{id} (scope credit_notes:read). */
export const GET = withApi(async (request: Request, ctx: { params: Promise<{ id: string }> }) => {
  const actor = await requireApiActor("credit_notes:read", request.headers);
  if (!isActor(actor)) return actor;
  const { id } = await ctx.params;
  return ok(CreditNoteSchema.parse(await getCreditNote(actor, id)));
});
