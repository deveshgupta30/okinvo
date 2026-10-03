import { CreditNoteSchema } from "@/lib/api/dto";
import { ok } from "@/lib/api/envelope";
import { withApi } from "@/lib/api/handlers";
import { isActor, requireApiActor } from "@/server/auth";
import { issueCreditNote } from "@/server/dal/credit-notes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/v1/credit-notes/{id}/issue (credit_notes:create). */
export const POST = withApi(async (request: Request, ctx: { params: Promise<{ id: string }> }) => {
  const actor = await requireApiActor("credit_notes:create", request.headers);
  if (!isActor(actor)) return actor;
  const { id } = await ctx.params;
  return ok(CreditNoteSchema.parse(await issueCreditNote(actor, id)));
});
