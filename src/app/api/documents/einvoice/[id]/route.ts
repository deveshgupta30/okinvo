import { toGstEInvoice, GstEInvoiceError } from "@/lib/einvoice/gst/build";
import { einvoiceInputFromInvoice } from "@/lib/einvoice/input";
import { safeFileStem } from "@/lib/numbering";
import { isActor, requireApiScopes } from "@/server/auth";
import { NotFoundError } from "@/server/dal/errors";
import { getInvoice } from "@/server/dal/invoices";

export const runtime = "nodejs";

/**
 * `GET /api/documents/einvoice/{id}?format=gst` (spec §9e): the GST e-invoice JSON (INV-01) of
 * an issued invoice, built from its snapshots on every request. A signed-in viewer or an API
 * key with `documents:read` may download it.
 */
export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const r = await requireApiScopes(request.headers);
  if (r instanceof Response) return r;
  if (!r.scopes.includes("documents:read") || !isActor(r.actor)) {
    return Response.json({ error: "insufficient_scope" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const format = new URL(request.url).searchParams.get("format") ?? "gst";
  if (format !== "gst") return Response.json({ error: "unknown_format" }, { status: 400 });
  try {
    const inv = await getInvoice(r.actor, id);
    if (inv.status === "DRAFT" || !inv.number) {
      return Response.json({ error: "not_issued" }, { status: 409 });
    }
    const json = toGstEInvoice(einvoiceInputFromInvoice(inv));
    const body = JSON.stringify(json, null, 2);
    return new Response(body, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${safeFileStem(inv.number)}-einvoice.json"`,
        "Cache-Control": "private, max-age=0, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    if (e instanceof NotFoundError) return Response.json({ error: "not_found" }, { status: 404 });
    if (e instanceof GstEInvoiceError) {
      return Response.json({ error: "einvoice_invalid", message: e.message }, { status: 422 });
    }
    throw e;
  }
}
