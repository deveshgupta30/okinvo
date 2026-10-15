import { InvoiceSchema } from "@/lib/api/dto";
import { ok } from "@/lib/api/envelope";
import { withApi } from "@/lib/api/handlers";
import { isActor, requireApiActor } from "@/server/auth";
import { issueInvoice } from "@/server/dal/invoices";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/v1/invoices/{id}/issue - allocates the number, freezes and renders (invoices:create). */
export const POST = withApi(async (request: Request, ctx: { params: Promise<{ id: string }> }) => {
  const actor = await requireApiActor("invoices:create", request.headers);
  if (!isActor(actor)) return actor;
  const { id } = await ctx.params;
  return ok(InvoiceSchema.parse(await issueInvoice(actor, id)));
});
