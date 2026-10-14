import { toCii } from "@/lib/einvoice/cii/build";
import { toGstEInvoice, GstEInvoiceError } from "@/lib/einvoice/gst/build";
import {
  einvoiceInputFromCreditNote,
  einvoiceInputFromInvoice,
  type EInvoiceInput,
} from "@/lib/einvoice/input";
import { toUbl } from "@/lib/einvoice/ubl/build";
import { safeFileStem } from "@/lib/numbering";
import { isActor, requireApiScopes } from "@/server/auth";
import { getCreditNote } from "@/server/dal/credit-notes";
import { NotFoundError } from "@/server/dal/errors";
import { getInvoice } from "@/server/dal/invoices";

export const runtime = "nodejs";

const FORMATS = ["gst", "cii", "ubl"] as const;
type Format = (typeof FORMATS)[number];
const isFormat = (v: string): v is Format => (FORMATS as readonly string[]).includes(v);

/**
 * `GET /api/documents/einvoice/{id}?format=gst|cii|ubl[&kind=creditNote]` (spec §9e): the
 * e-invoice of an issued invoice or credit note, built from its snapshots on every request:
 * the GST INV-01 JSON (invoices only), the EN 16931 CII XML or the Peppol BIS Billing 3.0 UBL
 * XML. A signed-in viewer or an API key with `documents:read` may download it.
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
  const url = new URL(request.url);
  const format = url.searchParams.get("format") ?? "gst";
  const creditNote = url.searchParams.get("kind") === "creditNote";
  if (!isFormat(format) || (creditNote && format === "gst")) {
    return Response.json({ error: "unknown_format" }, { status: 400 });
  }
  try {
    let input: EInvoiceInput;
    if (creditNote) {
      const cn = await getCreditNote(r.actor, id);
      if (cn.status === "DRAFT" || !cn.number) {
        return Response.json({ error: "not_issued" }, { status: 409 });
      }
      input = einvoiceInputFromCreditNote(cn);
    } else {
      const inv = await getInvoice(r.actor, id);
      if (inv.status === "DRAFT" || !inv.number) {
        return Response.json({ error: "not_issued" }, { status: 409 });
      }
      input = einvoiceInputFromInvoice(inv);
    }
    const stem = safeFileStem(input.number);
    const out =
      format === "gst"
        ? {
            body: JSON.stringify(toGstEInvoice(input), null, 2),
            type: "application/json; charset=utf-8",
            name: `${stem}-einvoice.json`,
          }
        : {
            body: format === "cii" ? toCii(input) : toUbl(input),
            type: "application/xml; charset=utf-8",
            name: `${stem}-${format}.xml`,
          };
    return new Response(out.body, {
      headers: {
        "Content-Type": out.type,
        "Content-Disposition": `attachment; filename="${out.name}"`,
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
