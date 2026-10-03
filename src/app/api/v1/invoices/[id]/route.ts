import { InvoiceSchema } from "@/lib/api/dto";
import { ok } from "@/lib/api/envelope";
import { withApi } from "@/lib/api/handlers";
import { isActor, requireApiActor } from "@/server/auth";
import { getInvoice } from "@/server/dal/invoices";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/invoices/{id} (scope invoices:read). */
export const GET = withApi(async (request: Request, ctx: { params: Promise<{ id: string }> }) => {
  const actor = await requireApiActor("invoices:read", request.headers);
  if (!isActor(actor)) return actor;
  const { id } = await ctx.params;
  return ok(InvoiceSchema.parse(await getInvoice(actor, id)));
});
